
var cardNames = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];

var rankFromName = {
  '2': 0,
  '3': 1,
  '4': 2,
  '5': 3,
  '6': 4,
  '7': 5,
  '8': 6,
  '9': 7,
  'T': 8,
  'J': 9,
  'Q': 10,
  'K': 11,
  'A': 12,
};

function rankComparator(a, b) {
    return cardNames.indexOf(b) - cardNames.indexOf(a);
}

function sortSuit(suit) {
    return suit.split('').sort(rankComparator).join('');
}

function cleanSuit (suit) {
    var cleanSuit = suit.toUpperCase();

    var used = [];
    cleanSuit = [].filter.call(cleanSuit, function (c) {
        if (c === 'X') {
            return true;
        }

        var index = cardNames.indexOf(c);
        if (index !== -1 && !used[index]) {
            used[index] = true;
            return true;
        }

        return false;
    });

    return cleanSuit.sort(rankComparator).join('').replace(/X/g, 'x');
}

function Model() {
    this.hands = [];

    this.removeUsedCards = function (hand, suit, cards) {
        function isNewCard(c) {
            return c === 'x' || cards.indexOf(c) === -1;
        }

        for (var i = 0; i < 4; i++) {
            if (i === hand) {
                continue;
            }

            var str = this.hands[i].strs[suit];
            var newSuit = [].filter.call(str(), isNewCard).join('');
            str(newSuit);
        }
    };

    this.shouldReplaceXs = true;

    this.replaceXs = function() {
        var hand, suit, str;
        var result = [['','','',''],['','','',''],['','','',''],['','','','']];

        if (!this.shouldReplaceXs) {
            for (hand = 0; hand < 4; hand++) {
                for (suit = 0; suit < 4; suit++) {
                    str = this.hands[hand].suits[suit]();
                    result[hand][suit] = str.length > 0 ? str : this.hands[hand].strs[suit]();
                }
            }
            return result;
        }

        for (suit = 0; suit < 4; suit++) {
            while (true) {
                var used = [];
                var lowestUsed = [];
                var numXs = [];

                for (hand = 0; hand < 4; hand++) {
                    lowestUsed[hand] = 10;
                    numXs[hand] = 0;

                    str = this.hands[hand].strs[suit]();
                    [].forEach.call(str, function (c) {
                        if (c === 'x') {
                            numXs[hand]++;
                        }
                        else {
                            var rank = rankFromName[c];
                            used[rank] = true;
                            lowestUsed[hand] = Math.min(lowestUsed[hand], rank);
                        }
                    });

                    if (result[hand][suit] !== '') {
                        numXs[hand] = 0;
                    }
                }

                var totalXs = _.reduce(
                    numXs,
                    function (memo, num) { return memo + num; },
                    0);

                if (totalXs === 0) {
                    break;
                }

                var unused = cardNames.filter(function (n, index) {
                    return !used[index];
                });

                var handsDone = 0;
                var doneHand = [false, false, false, false];
                while(handsDone < 4) {
                    var lowestVal = 99;
                    var lowestIndex = 0;
                    for (hand = 0; hand < 4; hand++) {
                        if (lowestUsed[hand] < lowestVal && !doneHand[hand]) {
                            lowestVal = lowestUsed[hand];
                            lowestIndex = hand;
                        }
                    }

                    var handNum = lowestIndex;
                    var suitStr = this.hands[handNum].strs[suit]().replace(/x/g,'');
                    for (var i = 0; i < numXs[handNum]; i++) {
                        var tries = 0;
                        while (tries < 1000) {
                            var index = Math.floor((Math.random() * unused.length));
                            if (rankFromName[unused[index]] < lowestUsed[handNum]) {
                                suitStr += unused[index];
                                unused.splice(index, 1);
                                break;
                            }

                            tries++;
                        }

                        if (tries > 999) { console.log("Couldn't find cards to replace Xs"); }
                    }

                    doneHand[handNum] = true;
                    result[handNum][suit] = sortSuit(suitStr);

                    handsDone++;
                }
            }
        }

        return result;
    };

    ko.extenders.rank = function(target, parms) {
        //create a writable computed observable to intercept writes to our observable
        var result = ko.pureComputed({
            read: target,  //always return the original observables value
            write: function(newValue) {

                var current = target();
                var valueToWrite = cleanSuit(newValue);

                //only write if it changed
                if (valueToWrite !== current) {
                    target(valueToWrite);

                    model.removeUsedCards(parms.hand, parms.suit, valueToWrite);
                } else {
                    //if capitalization or sorting changed the value, force an update
                    if (newValue !== current) {
                        target.notifySubscribers(valueToWrite);
                    }
                }
            }
        }).extend({ notify: 'always' });
     
        result(target());
     
        return result;
    };

    this.makeStr = function (hand, suit) {
        return ko.observable('').extend({rank: { hand: hand, suit: suit }});
    };

    this.makeSuit = function (hand, suit) {
        return ko.computed(function () {
            return this.replaceXs()[hand][suit];
        }, this);
    };

    this.fillEW = function () {
        this.shouldReplaceXs = false;

        for(var suit = 0; suit < 4; suit++) {
            this.hands[0].strs[suit]('');
            this.hands[2].strs[suit]('');
        }

        var wGetsExtra = true;
        for(var suit = 0; suit < 4; suit++) {
            var used = [];

            for (var hand = 1; hand < 4; hand += 2) {
                var str = this.hands[hand].suits[suit]();
                [].forEach.call(str, function (c) { 
                    var rank = rankFromName[c];
                    used[rank] = true;
                });
            }

            var unused = cardNames.filter(function (n, index) {
                return !used[index];
            });

            var wStr = '';
            var numW = Math.floor((unused.length / 2) + (wGetsExtra ? 0.5 : 0));
            var numE = unused.length - numW;
            if (numE !== numW) {
                wGetsExtra = !wGetsExtra;
            }

            for (var i = 0; i < numW; i++) {
                var index = Math.floor(Math.random() * unused.length);
                wStr += unused[index];
                unused.splice(index, 1);
            }

            var eStr = unused.join('');
            wStr = sortSuit(wStr);
            eStr = sortSuit(eStr);

            this.hands[0].strs[suit](wStr);
            this.hands[2].strs[suit](eStr);
        }

        this.shouldReplaceXs = true;
    };

    for (var i = 0; i < 4; i++) {
        var hand = {
            strs: [],
            suits: [],
        };
        this.hands.push(hand);

        for (var j = 0; j < 4; j++) {
            hand.strs.push(this.makeStr(i, j));
        }
    }

    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
            this.hands[i].suits.push(this.makeSuit(i, j));
        }
    }

    this.handError = ko.computed(function () {
        for (var i = 0; i < 4; i++) {
            var hand = this.hands[i];
            var numCards = 0;

            for (var j = 0; j < 4; j++) {
                numCards += hand.suits[j]().length;
            }

            if (numCards !== 13) {
                return "Player " + i + " doesn't have 13 cards";
            }
        }

        for (var suit = 0; suit < 4; suit++) {
            var used = [];
            for (var hand = 0; hand < 4; hand++) {
                var str = this.hands[hand].suits[suit]();
                [].forEach.call(str, function (c) { 
                    var rank = rankFromName[c];
                    if (used[rank]) {
                        return "Suit " + suit + " rank " + rank + " appears twice";
                    }
                    used[rank] = true;
                });
            }

            for (var rank = 0; rank < 13; rank++) {
                if (!used[rank]) {
                    return "Suit " + suit + " rank " + rank + " unused";
                }
            }
        }

        return "";
    }, this);

    this.saveHand = function () {
        if (this.handError() !== '') {
            alert("Can't save with errors!");
            return;
        }

        var handStrs = [];
        for (var hand = 0; hand < 4; hand++) {
            var handStr = '';
            for (var suit = 3; suit >= 0; suit--) {
                handStr += this.hands[hand].suits[suit]() + '.';
            }
            handStr = handStr.replace(/T/g, '10');
            handStrs.push(handStr);
        }

        var data = {
            id: -1,
            hands: handStrs,
            expectedBids: [],
            dealer: 3,
            vulnerability: 0,
            tags: [],
        };

        console.log(JSON.stringify(data));

        $.ajax({
          url:'/hands',
          type:"POST",
          data:JSON.stringify(hand),
          contentType:"application/json; charset=utf-8",
          dataType:"json"
        })
        .done(function (data) {
            console.log('Created hand ' + id);
        });
    };
}

var model = new Model();
ko.applyBindings(model);