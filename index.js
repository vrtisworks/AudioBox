// AudioBox - a NODE audio player for the Raspberry Pi (or just about any linux)
//TODO:
// Do we need an option to 'Loop' the playlist instead just once.
// Ask for 'x' minutes of least played music
// Really should html escape the titles etc.
// Implement start/stop/pause/skip commands to Liquidsoap
// We need to use the Telnet command to 'stop' the audio when the playlist runs out of entries.
//     Otherwise, it will spin trying to get another file.
// We need to keep a 'current song' index, instead of changes to the playlist.  This can be set
//     to 0 (first song) when we load a new playlist into 'current' (means it will not persist over
//     across node restarts.. but that is an enhancement for V2).
// V2 - need an option to randomize the playlist.
//      need an option to select random tracks (time?, count?)

//The 'process'
// 1) Start up Liquidsoap
// 2) Start up NODE.
// 3) Wait for browser to connect.

//ToDo:
//* - The whole "which pieces are running, and in what order" needs some thought/work.
//* - The second 'currently playing' track doesn't get highlighted.
//    I suspect this is because LiquidSoap gets two tracks initially.
//* - When updating the current playlist, should update cplidx depending where the update is.
//* - Need to add code for stop/start/forward/reverse
//* - Need to add 'mute' for volume control
//* - Need to implement 'delete from current playlist'
//* - Need to implement 'play me next' (do we?)
//* - Change the 'empty current playlist' to a drop down with infrequent options
//* - Need to 'fix' the playMe (play local in browser).. doesn't get the right filename
//* - Check to see if DB needs to be created, and do so if necessary
//* - Module to read ID3 information

//* - REFACTOR - model needs to some of the 'cpl' stuff in the model
//             - make sure the request passed to model is consistant
//             - move the emits out of model and into index.js(?) via a callback in request (playload returned in request.payload)
//             - do I have any multiple returns from model?
//             - rename cplidx to cplid (maybe rethink the whole 'cpl' idea - make it an object?)

var express=require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var telnet = require('telnet-client');
var telnetconnection = new telnet();
var telnetconnected=false;

var telnetparms = {
  host: '192.168.0.112',			//Change to localhost/127.0.0.1 later
  port: 1234,
  shellPrompt: 'END',
  echoLines: 0,
  timeout: 1500
};

//We will set up the telnet connection early, just to get it done.
telnetconnection.on("connect", function() {
	console.log("Connected");
	telnetconnected=true;
	//I had this 'inline', but we got further into setup before the connect finished... so we do it here.
	//This is not too important, but it save a few percent CPU on the PI
	sendTelnet("dummy.stop",function(response) {
		console.log("Dummy.stop response:"+response);
	});
});

//Trap the error and send it to the browser if we can
telnetconnection.on("error", function(err) {
	console.log("Telnet error:");
	console.log(err);
	//Send an alert off to the browser if we can
	if (songCallbacks) {
		io.emit(songCallbacks.gotAnError,JSON.stringify(err));
	}
});
//Crank up telnet
telnetconnection.connect(telnetparms);

function sendTelnet(cmd, callback) {
	if (telnetconnected) {
		telnetconnection.exec(cmd, function(response) {
			console.log(cmd+" Response: "+response);
			callback(response);
		});
	} else {
		//Send an alert off to the browser if we can
		if (songCallbacks) {
			io.emit(songCallbacks.gotAnError,'{"error":"Not connected","cmd":"'+cmd+'"}');
		}
		console.log("Not connected: "+cmd);
	}
}

var sqlite3 = require('sqlite3').verbose();
//Load the db model code.
var audiobox_model = require('./public/js/audiobox_model.js')(sqlite3,io);

//These are the callbacks from the browser for when we get information from Liquidsoap
var songCallbacks;

//Put all our static assets in public
app.use(express.static('public'));

//This is really just a complicated single page app
app.get('/', function(req, res){
	res.sendFile(__dirname + '/public/audiobox_main.html');
});

//From Liquidsoap when it wants the next file to play
app.get('/getNextSongFileName',function(req,res) {
	audiobox_model.getNextSongFileName(res);
});

//I had hoped to do this via osc so I would not have to worry about how long it takes to get something back to LS
app.get('/songStarted/:cplidx',function(req,res) {
	//I HOPE this closes the HTTP connection, so I can take my time about the rest.
	res.sendStatus(200);	
	var request=songCallbacks;
	request.remaining=0;
	audiobox_model.songStarted(req.params.cplidx,request);
});

io.on('connection', function(socket) {
	console.log('Connection established');
	//Not really too interested in when they disconnect.
	socket.on('disconnect', function(){
    	console.log('Disconnected');
  	});
	//Here are all the calls we make via the socket
	socket.on('registerSongEvents',registerSongEvents);
	//We will need the browser events in order to do much, so lets ask early.
	getSongEvents();
	socket.on('getCurrentPlaylist', getCurrentPlaylist);
	socket.on('getSavedLists', getSavedLists);
	socket.on('emptyCurrentList', emptyCurrentList);
	socket.on('replaceCurrentList',replaceCurrentList);
	socket.on('saveCurrentList',saveCurrentList);
	socket.on('getForReview',getForReview);
	socket.on('doSearch',doSearch);
	socket.on('updatePlaylist',updatePlaylist);
	socket.on('ratingChanged',ratingChanged);
	socket.on('cratesChanged',cratesChanged);
	socket.on('getSongCrates',getSongCrates);
	socket.on('adjustVolume',adjustVolume);
	//Since the browser is connected, let's see if anything is currently playing
	sendTelnet("audiobox.getid",function(response) {
		console.log("audiobox.getid: "+response);
		var lines=response.split('\n');
		if (lines[0]!='*') {
			//We currently have a song playing.. things are a little more complicated
			lines=lines[0].split(",");
			//First part is the PLID, second part is time remaining (sort of)
			lines[1]=Math.floor(lines[1]);
			console.log("Song PLID: "+lines[0]+" : "+lines[1]);
			var request=songCallbacks;
			request.remaining=lines[1];
			audiobox_model.setCurrentSong(lines[0]);
			audiobox_model.songStarted(lines[0],request);
		} else {
			//Nothing playing yet
			console.log("Nothing playing yet.");
		}
	});
});

//And lets start the music....
http.listen(3000, function(){
	console.log('listening on *:3000');
});

//Adjust volume (up, down or mute);
function adjustVolume(msg) {
	var request=JSON.parse(msg);
	//Get the current volume
	sendTelnet("var.get volume",function(response) {
		var lines=response.split('\n');	
		var volume=lines[0]*1.0;
		if (request.direction=="up" && volume<1.0) {
			volume+=0.10;
		} else if (request.direction=="down" && volume>0.0) {
			volume-=0.10;
		//NOTE:  Mute is different than stop.  When muted, the song will keep playing.
		} else if (request.direction=="mute") {
			volume=0.0;
		}
		sendTelnet("var.set volume="+volume, function() {
			return false;
		});
	});
}
//Gets the crates assigned to the currently playing song
function getSongCrates(msg) {
	console.log('getSongCrates: '+msg);
	var request=JSON.parse(msg);
	audiobox_model.getSongCrates(request);
}
//Just in case we start after the browser has started.
function getSongEvents() {
	io.emit('getSongEvents','');
}
//When the user changes the crates to put a song in
function cratesChanged(msg) {
	console.log('cratesChanged: '+msg);
	var request=JSON.parse(msg);
	audiobox_model.cratesChanged(request);
}
//When the user changes the rating for the currently playing song
function ratingChanged(msg) {
	console.log('ratingChanged: '+msg);
	var request=JSON.parse(msg);
	audiobox_model.ratingChanged(request);
}
//We need to know a few events to use when Liquid Soap lets us know a song actually started.
function registerSongEvents(msg) {
    console.log('registerSongEvents: ' + msg);
    songCallbacks=JSON.parse(msg);
}
//We the browser wants the complete list of crates
function getCratesList(msg) {
    console.log('getCratesList: ' + msg);
	var request=JSON.parse(msg);
    audiobox_model.getCratesList(request);
}
//When we want to save the current list with a name (it could be a replace)
//We don't bother returning anything, since nothing in the display changed.
function saveCurrentList(msg) {
    console.log('saveCurrentList: ' + msg);
    var request=JSON.parse(msg);
    audiobox_model.saveCurrentList(request.named);
}
//When they select a playlist to make 'current'
function replaceCurrentList(msg) {
    console.log('replaceCurrentList: ' + msg);
    var request=JSON.parse(msg);
    audiobox_model.replaceCurrentList(request);
}
//When we are asked to empty the current list
function emptyCurrentList(msg) {
    console.log('emptyCurrentList: ' + msg);
    var request=JSON.parse(msg);
    audiobox_model.emptyCurrentList(request.event);
}
//When we are asked for the current song list
function getCurrentPlaylist(msg) {
    console.log('getCurrentPlaylist: ' + msg);
    var request=JSON.parse(msg);
    audiobox_model.getCurrentPlaylist(request.event);
}
//When we want to get a list of all the playlists we have defined
function getSavedLists(msg) {
	console.log('getSavedLists: '+msg);
	var request=JSON.parse(msg);
	audiobox_model.getSavedLists(request.event);
}
//When we want to get a playlist to review the contents over on the right side.
function getForReview(msg) {
	console.log('getForReview: '+msg);
	var request=JSON.parse(msg);
	audiobox_model.getForReview(request);
}
//Do the search of the database
function doSearch(msg) {
	console.log('doSearch: '+msg);
	var request=JSON.parse(msg);
	audiobox_model.doSearch(request);
}
function updatePlaylist(msg) {
	console.log('updatePlaylist: '+msg);
	var request=JSON.parse(msg);
	audiobox_model.updatePlaylist(request);
}
