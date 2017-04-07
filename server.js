// server.js
// where your node app starts

// init project
var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var JsonDB = require('node-json-db');
var db = new JsonDB('bg', /*autoSave=*/true, /*humanReadable=*/true);
var expressWs = require('express-ws')(app);

app.use(express.static('public'));
app.use(bodyParser.json());

function getAll(req, res, next) {
    var hands = db.getData('/hands');
    res.json(hands);
}

function get(req, res, next) {
    var id = req.params.id;
    var hand = db.getData('/hands[' + id + ']');
    res.json(hand);
;}

function saveHand(req, res, next) {
    console.log(req.JSON);
    console.log(JSON.stringify(req.body, null, 2));
  
    var hand = req.body;
    if (hand.id != -1) {
        console.log('Updating hand ' + hand.id);
    }
    else {
        var hands = db.getData('/hands');
        hand.id = hands.length;

        console.log('Adding hand ' + hand.id);
    }

    db.push('/hands[' + hand.id + ']', hand);
    res.json({
        id: hand.id,
    });
}

function getWithTags(req, res, next) {
    var tags = req.query.tags;
    var hands = tags ?
        db.getData('/hands')
            .filter(function (hand) {
                var match = false;
                tags.forEach(function (tag) { match |= hand.tags.indexOf(tag) > -1; });
                return match;
            })
            .map(function (hand) { return hand.id; })
        : [];

    console.log('Got ' + hands.length + ' hands with ' + tags);
    res.json(hands);
}

function getAllTags(req, res, next) {
    var result;
  
    var tags = db.getData('/tags');
    if( req.query.term ) {
      result = tags.filter(function(tag) {
        return tag.indexOf( req.query.term ) != -1;
      });
    } else {
      result = tags;
    }
  
    res.json(result);
}

function addTag(req, res, next) {
  var isSuccess = true;
  var message = "";
  
  var tag = req.params.tag;
  
  if( tag ) {
    var tags = db.getData('/tags');
    if( tags.indexOf( tag ) == -1 ) {
      tags.push( tag );
      db.push('/tags', tags);
      message = 'Added tag ' + tag;
    } else {
      message = 'Ignoring duplicate tag ' + tag;
      isSuccess = false;
    }
  } else {
    message = 'No tag name specified';
    isSuccess = false;
  }
  console.log( message );
  res.json({ success: isSuccess, message: message });
}

function removeTag(req, res, next) {
  var tag = req.params.tag;
  
  if( tag ) {
    var tags = db.getData('/tags');
    var idx = tags.indexOf( tag );
    if( idx != -1 ) {
      // cascade the delete to all hands with this tag
      var hands = db.getData('/hands');
      hands.forEach(function(hand) {
        var i = hand.tags.indexOf(tag); 
        if( i != -1 ) {
          hand.tags.splice( i, 1 );
        }
      });
      db.push( '/hands', hands );

      tags.splice( idx, 1 );
      db.push( '/tags', tags );
      
      res.json({ success: true, message: 'Removed tag ' + tag });
    } else {
      res.status(404).json({success: false, message: 'No such tag'});
    } 
  } else {
    res.status(400).json({success: false, message: 'No tag name specified'});
  }
}

app.get('/hands/:id', get);
app.post('/hands', saveHand);
app.get('/hands', getAll);
app.get('/handswithtags', getWithTags);
app.get('/tags', getAllTags);
app.get('/tags/admin', function(request, response) {
  response.sendFile(__dirname + '/views/tag-admin.html');
});
app.post('/tags/:tag', addTag);
app.delete('/tags/:tag', removeTag);
app.get('/test', function(request, response) {
  response.sendFile(__dirname + '/views/test.html');
});


app.get("/", function (request, response) {
  response.sendFile(__dirname + '/public/index.html');
});

function HashTable(){
    var hash = new Object();
    this.put = function(key, value){
        if(typeof key === "string"){
            hash[key] = value;
        }
        else{
            if(key._hashtableUniqueId == undefined){
                key._hashtableUniqueId = UniqueId.prototype.generateId();
            }
            hash[key._hashtableUniqueId] = value;
        }

    };

    this.get = function(key){
        if(typeof key === "string"){
            return hash[key];
        }
        if(key._hashtableUniqueId == undefined){
            return undefined;
        }
        return hash[key._hashtableUniqueId];
    };
  
    this.remove = function (key) {
      if (typeof key === "string") {
        delete hash[key];
      }
      
      if(key._hashtableUniqueId){
        delete hash[key._hashtableUniqueId];
      }
    }
    
    this.size = function () {
      return Object.keys(hash).length;
    }
    
    this.keys = function () {
      return Object.keys(hash);
    }
}

function UniqueId(){

}

UniqueId.prototype._id = 0;
UniqueId.prototype.generateId = function(){
    return (++UniqueId.prototype._id).toString();
};

var sockets = new HashTable();
var halfGame = null;

var dump = function () {
  console.log(sockets.keys().map(function (key) { return sockets.get(key); }));
};

var send = function (ws, data) {
  ws.send(JSON.stringify(data));
};

app.ws('/ws', function(ws, req) {
  //  Add the new websocket to the list of connections
  sockets.put(ws, {ws: ws});
  console.log(sockets.size() + " connections open");
  
  ws.on('close', function(code, reason) {
    console.log("WS closed", code, reason);
    sockets.remove(ws);
    console.log(sockets.size() + " connections open");
  });
  
  ws.on('message', function(msg) {
    msg = JSON.parse(msg);
    console.log(msg);
    
    var thisConn = sockets.get(ws);
    if (msg.type === 'heartbeat') {
      return;
    }
    else if (msg.type === 'hello') {
      //  Connection message
      thisConn.name = msg.name;
      
      if (halfGame == null) {
        halfGame = thisConn;
      }
      else {
        var game = {
          conns: [halfGame, thisConn]
        };
        
        thisConn.game = game;
        halfGame.game = game;
        
        send(halfGame.ws, {type: 'newgame', partner: thisConn.name, master: true});
        send(thisConn.ws, {type: 'newgame', partner: halfGame.name, master: false});
        
        halfGame = null;
      }
    }
    else {
      //  Other messages are routed to partner
      var game = thisConn.game;
      if (game) {
        var otherSocket = game.conns[0].ws === ws ? game.conns[1].ws : game.conns[0].ws;
        send(otherSocket, msg);
      }
    }
  });
  
});

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});