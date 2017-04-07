"use strict";

/*global
  _,$,ko,sprintf-js
*/

var SERVER = "/";
var PROB_INDEX_KEY = 'probIndex';
var SELECTED_PROBLEMS_KEY = 'selectedProblems';
var NUM_SOLVED_KEY = 'numSolved';
var NUM_CORRECT_KEY = 'numCorrect';

var strainNames = ['C','D','H','S','NT'];
var strainSymbols = ['♣','♦','♥','♠','NT'];
var cardNames = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
var suitSortOrder = [1, 0, 2, 3];

var strainFromName = {
  'C': 0,
  'D': 1,
  'H': 2,
  'S': 3,
  'NT': 4
};

var strainStyleNames = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];

var rankFromName = {
  '2': 0,
  '3': 1,
  '4': 2,
  '5': 3,
  '6': 4,
  '7': 5,
  '8': 6,
  '9': 7,
  '10': 8,
  'J': 9,
  'Q': 10,
  'K': 11,
  'A': 12,
};

function compareSuits( suit1, suit2 ) {
	return suitSortOrder[suit1] - suitSortOrder[suit2];
}

function compareRanks( rank1, rank2 ) {
	return rank2 - rank1;
}

function sortCards( cards ) {
	return cards.sort(function(a,b){
		var result = compareSuits( a.suit, b.suit );
		if( result === 0 ) {
			result = compareRanks( a.rank, b.rank );
		}
		return result;
	});
}

function between( x, min, max ) {
  return (min <= x) && (x <= max);
}

function hcp(hand) {
	var pts = 0;
	for (var i = 0; i < 13; i++) {
		switch(cardNames[hand[i].rank]) {
			case 'A': pts += 4; break;
			case 'K': pts += 3; break;
			case 'Q': pts += 2; break;
			case 'J': pts += 1; break;
		}
	}
	return pts;
}

function getDist(hand) {
	var dist = [0, 0, 0, 0];
	for (var i = 0; i < 13; i++) {
		dist[hand[i].suit]++;
	}
	return dist;
}

function isFlat(hand) {
	var dist = getDist(hand);
	var doubletons = 0;
	for (var i = 0; i < 4; i++) {
		if (dist[i] < 2 || dist[i] > 5) {
			return false;
		}

		if (dist[i] === 2) {
			doubletons++;
		}
	}

	if (doubletons > 1) {
		return false;
	}

	return true;
}

function ruleOf20(hand) {
  var points = hcp( hand );
  var dist = getDist(hand);
  dist.sort( function( suit1, suit2 ) { 
    // descending by number of cards in suit
    return suit2 - suit1;
  });
  
  // HCP plus number of cards in two longest suits must be at least 20
  return (points + dist[0] + dist[1]) >= 20;
}

function no5CardMajor(hand) {
  var dist = getDist(hand);
  return (dist[2] < 5 && dist[3] < 5);
}

function handsFromStrings(strings) {
	var hands = [];
	_.each(strings, function (handStr) {
		var hand = [];

		var suits = handStr.split('.');
		for (var suitNum = 0; suitNum < 4; suitNum++) {
			var suit = suits[suitNum];
			for (var i = 0; i < suit.length; i++) {
				var rank = suit.substring(i, i + 1);
				if (rank === '1') {
					rank = '10';
					i++;
				}

				hand.push(new Card(suitNum, rankFromName[rank]));
			}
		}

		hands.push(hand);
	});
	return hands;
}

function handsToStrings(hands) {
	var handStrs = [];
	
	_.each(hands, function (hand) {
		var cards = '';
		var suits = _.groupBy(hand, function (card) { return card.suit; });

		function appendCard(card) {
			cards += cardNames[card.rank];
		}

		for (var s = 0; s < 4; s++) {
			_.each(suits[s], appendCard);
			cards += '.';
		}
		handStrs.push(cards);
	});

	return handStrs;
}

var Card = function (suit, rank) {
	this.suit = suit;
	this.rank = rank;
};

var Bid = function (level, strain) {
	this.strain = strain;
	this.strainName = strainStyleNames[strain];
	this.strainSymbol = strainSymbols[strain];
	this.level = level;
	this.isBid = true;
	this.comment = ko.observable('');
};

var Pass = function () {
	this.isPass = true;
	this.bidText = 'Pass';
	this.isBid = false;
	this.comment = ko.observable('');
};

var Double = function () {
	this.isDouble = true;
	this.bidText = 'Dbl';
	this.isBid = false;
	this.comment = ko.observable('');
};

var Redouble = function () {
	this.isRedouble = true;
	this.bidText = 'Rdbl';
	this.isBid = false;
	this.comment = ko.observable('');
};

var WaitingBid = function () {
  this.bidText = '?';
  this.isBid = false;
};

function compareBids(exp, bid) {
	if (exp.isPass !== bid.isPass ||
		exp.isDouble !== bid.isDouble ||
		exp.isRedouble !== bid.isRedouble) {
		return false;
	}

	if (exp.isBid) {
		if (exp.level !== bid.level ||
			exp.strain !== bid.strain) {
			return false;
		}
	}

	return true;
}

function shuffle(arr) {
	/**
	 * Implementation of the Fisher-Yates (aka Knuth) Shuffle
	 * See - http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
	 */	
	var currentIndex = arr.length, temporaryValue, randomIndex;

	// While there remain elements to shuffle...
	while (0 !== currentIndex) {

		// Pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;

		// And swap it with the current element.
		temporaryValue = arr[currentIndex];
		arr[currentIndex] = arr[randomIndex];
		arr[randomIndex] = temporaryValue;
	}
}

function localSet(key, value) {
	window.localStorage[key] = JSON.stringify(value);
}

function localGet(key) {
	var json = window.localStorage[key];
	return json ? JSON.parse(json) : null;
}

function getAllBids() {
	var bids = [];

	for(var level = 1; level <= 7; level++) {
		for (var strain = 0; strain < 5; strain++) {
			bids.push(new Bid(level, strain));
		}
	}

	return bids;
}

function getHandStats( seat, hand ) {
  return seat + ": HCP " + hcp(hand) + ", Dist " + getDist(hand).join("-") + "\n";
}

var Model = function (id, hands, dealer, vulnerability) {
	var self = this;

	this.randomHand = function () {
		var hands = dealHands();
    
		this.hands(hands);

		this.dealer(Math.floor((Math.random() * 4)));
		this.vulnerability(Math.floor((Math.random() * 4)));
		
		this.bidsMade([]);
		this.availableBids(getAllBids());
	};

	this.load = function (hand) {
		var dealer = hand.dealer;
		var hands = hand.hands;
    dealer = (dealer + 2) % 4;
    var firstTwo = hands.slice(0, 2);
    var secondTwo = hands.slice(2, 4);
    hands = secondTwo.concat(firstTwo);

		this.bidsMade([]);
		this.availableBids(getAllBids());

		this.dealer(dealer);
		this.vulnerability(hand.vulnerability);
		this.hands(handsFromStrings(hands));
	};

	this.dealer = ko.observable(dealer);
	this.hands = ko.observableArray(hands);

	this.numSolved = ko.observable(0);
	this.numCorrect = ko.observable(0);

	this.bidsMade = ko.observableArray([]);
	this.availableBids = ko.observableArray(getAllBids());
	this.vulnerability = ko.observable(vulnerability);
  this.master = ko.observable(false);
  this.myHandScored = ko.observable(false);
  this.partnerScored = ko.observable(false);

	this.bids = ko.computed(function () {
		return this.bidsMade();
	}, this);

	this.updateAvailableBids = function () {
		var bid = this.getLastBid(true);

		var ab = getAllBids();
		while(bid && true) {
			if (ab.length === 0) {
				break;
			}

			var nextBid = ab[0];
			if (nextBid.level > bid.level ||
				(nextBid.level == bid.level && nextBid.strain > bid.strain)) {
				break;
			}
			
			ab.splice(0, 1);
		}

		this.availableBids(ab);
	};

	this.makeBid = function (bid) {
		if (this.doneBidding()) {
			return;
		}
    
    var bids = model.bids();
    if (bids.length > 0 && bids[bids.length - 1].bidText === '?') {
      bids.pop();
    }
    
    console.log(model.curSeat() + ' bidding ');
    console.log(bid);
    
    bid.seat = model.curSeat();
    if (model.curSeat() == 3) {
      send({type: 'bid', bid: bid});
    }
    this.bidsMade.push(bid);
    
    var bidsMade = this.bidsMade();

    if (model.curSeat() != 3 && model.curSeat() != 1) {
      setTimeout(function () { self.makeBid(new Pass()); }, 500);
    }
    
		this.updateAvailableBids();
	};

	this.restartBidding = function () {
    this.myHandScored(false);
    this.partnerScored(false);
    
    ranges.forEach(function (range) {
      $('.max-' + range.class).removeClass('wrong').removeClass('right').val('');
      $('.min-' + range.class).removeClass('wrong').removeClass('right').val('');
    });
    
    this.bidsMade([]);
    if (this.curSeat() % 2 == 0) {
      this.makeBid(new Pass());
		}
    else if (this.curSeat() == 1) {
      this.bidsMade.push(new WaitingBid());
    }
    
    console.log('Restarted, curSeat=' + this.curSeat());
	};

	this.suitGroups = function (seat, suitOrder) {
		var cardsBySuitNum = _.groupBy(self.hands()[seat], function (card) { return card.suit; });
		var groups = _.mapObject(cardsBySuitNum, function (cards, suitNum) {
			var cardsWithNames = cards.map(function (card) { return { rank: cardNames[card.rank] }; });

			return {
				suitName: strainStyleNames[suitNum],
				cards: cardsWithNames,
			};
		});

		var suitGroups = [];
		for (var i = 0; i < suitOrder.length; i++) {
			if (groups[suitOrder[i]]) {
				suitGroups.push(groups[suitOrder[i]]);
			}
			else {
				suitGroups.push({
					suitName: strainStyleNames[suitOrder[i]],
					cards: [],
				});
			}
		}
		return suitGroups;
	};

	this.myHandSuitGroups = ko.computed(function () {
		return this.suitGroups(3, [1, 0, 2, 3]);
	}, this);

	this.handRows = ko.computed(function () {
		var suitOrder = [3, 2, 1, 0];

		return [
		{
			hands: [
				{ suits: false, center: false },
				{ suits: this.suitGroups(1, suitOrder), center: false },
				{ suits: false, center: false },
			],
		},
		{
			hands: [
				{ suits: this.suitGroups(0, suitOrder), center: false },
				{ suits: false, center: true },
				{ suits: this.suitGroups(2, suitOrder), center: false },
			],
		},
		{
			hands: [
				{ suits: false, center: false },
				{ suits: this.suitGroups(3, suitOrder), center: false },
				{ suits: false, center: false },
			],
		},
		];
	}, this);

	this.availableLevels = ko.computed(function () {
		var levelObj = _.groupBy(this.availableBids(), function (bid) { return bid.level; });
		levelObj = _.mapObject(levelObj, 
			function (bids, level) {
				return { level: level, bids: bids, numPlaceholders: 5 - bids.length };
			}
		);
		return _.values(levelObj);
	}, this);

	this.bidsToRows = function(bids) {
		_.each(bids, function (bid, index) { bid.index = index; });
		
		var rows = [];
		var index = (5 - this.dealer()) % 4;
		var row = {
			bids: bids.slice(0, index),
			numPlaceholders: (this.dealer() + 3) % 4,
		};

		if (row.numPlaceholders) {
			rows.push(row);
		}

		while (index < bids.length) {
			rows.push({
				bids: bids.slice(index, index + 4),
				numPlaceholders: 0,
			});

			index += 4;
		}

		return rows;
	};

	this.bidsMadeRows = ko.computed(function () {
		return this.bidsToRows(this.bidsMade());
	}, this);

	this.getLastBid = function (realBidsOnly) {
		var bids = this.bids();
		var index = _.findLastIndex(bids, function (bid) { return realBidsOnly ? bid.isBid : !bid.isPass; });
		if (index >= 0) {
			return bids[index];
		}

		return null;
	};

	this.curSeat = function () {
		return (this.dealer() + this.bids().length) % 4;
	};

	this.canDouble = ko.computed(function () {
		var curSeat = this.curSeat();
		var lastBid = this.getLastBid();
		return lastBid && !lastBid.isRedouble && !lastBid.isDouble && lastBid.seat % 2 !== curSeat % 2;
	}, this);

	this.canRedouble = ko.computed(function () {
		var curSeat = this.curSeat();
		var lastBid = this.getLastBid();
		return lastBid && lastBid.seat % 2 !== curSeat % 2 && lastBid.isDouble;
	}, this);

	this.nsVulnerable = ko.computed(function () {
		return this.vulnerability() % 2 === 1;
	}, this);

	this.ewVulnerable = ko.computed(function () {
		return this.vulnerability() > 1;
	}, this);

	this.doneBidding = ko.computed(function () {
		var bids = this.bids();
		if (bids.length < 3) {
			return false;
		}

		return _.every(bids.slice(bids.length - 3), function (bid) { return bid.isPass; });
	}, this);

  this.handDataFromModel = function () {
    function getBidData(bid) { 
      if (bid.isPass) {
        return "P";
      } else if (bid.isDouble) {
        return "X";
      } else if (bid.isRedouble) {
        return "XX";
      } else return bid.level + strainNames[bid.strain];
    }

    return {
      hands: handsToStrings(this.hands()),
      dealer: this.dealer(),
      vulnerability: this.vulnerability(),
    };
  };

  this.restartBidding();
};

function onBidClicked(event) {
	event.preventDefault();
	if (model.curSeat() !== 3) {
		return;
	}

	var card = $(event.target).closest('.callcard');

	var bid;
	var type = card.attr('id');
	
	if (type === 'pass') {
		bid = new Pass();
	}
	else if (type === 'double') {
		bid = new Double();
	}
	else if (type === 'redouble') {
		bid = new Redouble();
	}
	else {
		var level = parseInt(card.attr('level'), 10);
		var strain = parseInt(card.attr('strain'), 10);
		bid = new Bid(level, strain);
	}

	model.makeBid(bid);
}

function dealHands() {
	var deck = [];
	for (var i = 0; i < 4; i++) {
		for (var j = 0; j < cardNames.length; j++) {
			deck.push(new Card(i, j));
		}
	}

	shuffle(deck);
	var hands = [];
	while(deck.length > 0) {
		hands.push(sortCards(deck.splice(0, 13)));
	}

	return hands;
}

function onNextHand(event) {
	event.stopPropagation();

  model.randomHand();
  model.restartBidding();
  send({type: 'hand', hand: model.handDataFromModel()});
}

var ranges = [
  {
    class: 'hcp',
    value: function (hand) { return hcp(hand); }
  },
  {
    class: 's',
    value: function (hand) { return getDist(hand)[3]; }
  },
  {
    class: 'h',
    value: function (hand) { return getDist(hand)[2]; }
  },
  {
    class: 'd',
    value: function (hand) { return getDist(hand)[1]; }
  },
  {
    class: 'c',
    value: function (hand) { return getDist(hand)[0]; }
  },
];

function onCheckNotes(event) {
  event.stopPropagation();
  
  var hand = model.hands()[1];
  ranges.forEach(function (range) {
    
    var checked = false;
    var rangeRight = true;
    
    var minClass = '.min-' + range.class;
    var min = $(minClass).val();
    var right;
    if (min.length > 0) {
      checked = true;
      right = range.value(hand) >= min;
      $(minClass).addClass(right ? 'right' : 'wrong');
      rangeRight &= right;
    }
    
    var maxClass = '.max-' + range.class;
    var max = $(maxClass).val();
    if (max.length > 0) {
      checked = true;
      right = range.value(hand) <= max;
      $(maxClass).addClass(right ? 'right' : 'wrong');
      rangeRight &= right;
    }
    
    if (!rangeRight) {
      
    }
    if (checked) {
      console.log(range.class + ' ' + right);
    }
  });
  
  model.myHandScored(true);
  send({type: 'score'});
}

$('body')
    .on('click', '.callcard', onBidClicked)
    .on('click', '.nexthand', onNextHand)
    .on('click', '.checknotes', onCheckNotes)
;

var model = new Model(-1, dealHands(), 1, 1);

ko.applyBindings(model);

//var name = prompt('Enter your name');
var socket = new WebSocket('wss://bid-test.glitch.me/ws');

var send = function (obj) {
  socket.send(JSON.stringify(obj));
}

socket.onopen = function(event) {
  console.log('Connected');
  send({type: 'hello', name: 'Bidder'});
  
  setInterval(function () { send({type: 'heartbeat'}); }, 15000);
};

socket.onerror = function(error) {
  console.log('WebSocket Error: ' + error);
};

socket.onmessage = function(event) {
  var data = JSON.parse(event.data);
  console.log('Received message:');
  console.log(data);
  
  if (data.type === 'newgame') {
    model.master(data.master);
    if (data.master) {
      send({type: 'hand', hand: model.handDataFromModel()});
    }
  }
  else if (data.type === 'hand') {
    model.load(data.hand);
    model.restartBidding();
  }
  else if (data.type === 'bid') {
    console.log('bid', data.bid);
    model.makeBid(data.bid);
  }
  else if (data.type === 'score') {
    model.partnerScored(true);
  }
};