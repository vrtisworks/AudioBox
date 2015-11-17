// AudioBox - a NODE audio player for the Raspberry Pi (or just about any linux)

//The 'process'
// 1) Start up Liquidsoap
// 2) Start up NODE.
// 3) Wait for browser to connect.

//ToDo:
//* - BUG - don't let them try to start playing if the playlist is empty
//* - BUG - if they delete the only song in a playlist, we need to 'destroy' the source or Liquidsoap will beat the system up asking
//* - BUG - Really should html escape the titles etc.
//* - Need to add 'mute' for volume control
//* - Need to implement 'delete from current playlist'
//* - Need to implement 'play me next'
//* - Check to see if DB needs to be created, and do so if necessary
//* - Module to read ID3 information
//* - need an option to play the list only once.
//* - need an option to play everything locally (this is not a simple change though)

var express=require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var telnet = require('telnet-client');
var telnetconnection = new telnet();
var telnetconnected=false;
/*
//These are the callbacks from the browser for when we get information from Liquidsoap
var songCallbacks={
	listevent : "gotCurrentSongList",
	songevent : "songStarted",
	crateevent : "songCrates",
	clearcurrentevent : "clearCurrentPlaying",
	errorevent : "gotAnError"};
*/

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
		console.log("dummy.stop response:"+response);
	});
});

//Trap the error and send it to the browser if we can
telnetconnection.on("error", function(err) {
	console.log("Telnet error:");
	console.log(err);
	//Send an alert off to the browser if we can
	io.emit("gotAnError",JSON.stringify(err));
});
//Crank up telnet
telnetconnection.connect(telnetparms);

//Load the db model code.
var Audiobox_Model = require('./public/js/audiobox_model.js');
var audioboxDB = new Audiobox_Model(io);
audioboxDB.setUp(housekeeping);	//Once setup is done, I can check up on LiquidSoap status and other housekeeping 'stuff'

//Put all our static assets in public
app.use(express.static('public'));

//This is really just a complicated single page app
app.get('/', function(req, res){
	res.sendFile(__dirname + '/public/audiobox_main.html');
});

//From Liquidsoap when it wants the next file to play
app.get('/getNextSongFileName',function(req,res) {
	console.log("getNextSongFileName");
	audioboxDB.getNextSongFileName(res);
});
//From the browser send then want to play a song locally
app.get('/loadSong/:thisTrackId',function(req,res) {
	audioboxDB.getTrackFileLocation(req.params.thisTrackId,function(sendthis) {
		console.log("/loadSong"+sendthis);
		res.sendFile(sendthis);
	});
});

//I had hoped to do this via osc so I would not have to worry about how long it takes to get something back to LS
app.get('/songStarted/:thisPlId',function(req,res) {
	//I HOPE this closes the HTTP connection, so I can take my time about the rest.
	res.sendStatus(200);	
	console.log("songStarted");
	audioboxDB.setSongPlaying('r',req.params.thisPlId);
	audioboxDB.getSongStarted();
});

io.on('connection', function(socket) {
	console.log('Connection established');
	//Not really too interested in when they disconnect.
	socket.on('disconnect', function(){
    	console.log('Disconnected');
  	});
	//Here are all the calls we make via the socket
	socket.on('getCurrentPlaylist', getCurrentPlaylist);
	socket.on('getPlaylists', getPlaylists);
	socket.on('getPlaylistNames', getPlaylistNames);
	socket.on('emptyCurrentList', emptyCurrentList);
	socket.on('replaceCurrentList',replaceCurrentList);
	socket.on('saveCurrentList',saveCurrentList);
	socket.on('getForReview',getForReview);
	socket.on('doSearch',doSearch);
	socket.on('updatePlaylist',updatePlaylist);
	socket.on('ratingChanged',ratingChanged);
	socket.on('cratesChanged',cratesChanged);
	socket.on('getSongCrates',getSongCrates);
	socket.on('startStop',startStop);
	socket.on('adjustVolume',adjustVolume);
	socket.on('doSkip',doSkip);
	socket.on('randomList',randomList);
	socket.on('createCrate',createCrate);
	socket.on('getCrateForReview',getCrateForReview);
	socket.on('getCratesList',getCratesList);
	socket.on('getCratesListReview',getCratesListReview);
	socket.on('removeFromList',removeFromList);
	//Check to see if anything is currently playing
	var songPlaying=audioboxDB.getCurrentStatus();
	if (songPlaying!='*') {
		//Yes-so we need to ask LiquidSoap for the time remaining.
		sendTelnet("audiobox.getid", function(response) {
			console.log("Browser getid: "+response);
			var lines=response.split("\n");
			//We get Currently Playing ID, Time Remaining, Last requested ID
			lines=lines[0].split(",");
			//First part is the songId, second part is time remaining (sort of)
			lines[1]=Math.floor(lines[1]);
			console.log("Playing: "+lines[0]+" : "+lines[1]);
			audioboxDB.setSongPlaying("r", lines[0])
			audioboxDB.getSongStarted(lines[1]);
		});
	}		//The browser assumes nothing is playing, so we don't need to do anything
});

//We need to do some housekeeping before we can start accepting browser connections
function housekeeping() {
	console.log("In housekeeping");
	//Ask LiquidSoap if anything is currently playing and what we have given it to decode.
	sendTelnet("audiobox.getid", function(response) {
		console.log("Initial getid: "+response);
		var lines=response.split('\n');
		//We get Currently Playing ID, Time Remaining, Last requested ID
		lines=lines[0].split(",");
		//Tell the model to set up the next & playing indexes based on the last song Liquidsoap requested.
		audioboxDB.setNextSongIdx(lines[2]);
		if (lines[0]=="*") {
			//Pretty simple - nothing is playing, so we can just start up connections
			audioboxDB.setSongPlaying("*", "");
			http.listen(3000, function() {
				console.log('Listening:Nothing playing');
			});
		} else {
			//We know that LiquidSoap has 'started' playing a song, but don't know if it has been paused, or is still playing
			sendTelnet("localAudio.status",function(repsonse) {
				var onoff=response.split("\n");
				if (onoff[0]=="on") {
					//It is still running
					audioboxDB.setSongPlaying("r", lines[0]);
				} else {
					//It is paused
					audioboxDB.setSongPlaying("p", lines[0]);
				}
				//NOW we can accept connections
				http.listen(3000, function() {
					console.log('Listening: '+onoff[0]);
				});
			});
		}
	});
};

function sendTelnet(cmd, callback) {
	if (telnetconnected) {
		telnetconnection.exec(cmd, function(response) {
			//console.log(cmd+" Response: "+response);
			callback(response);
		});
	} else {
		//Send an alert off to the browser too
		io.emit("gotAnError",'{"error":"Not connected","cmd":"'+cmd+'"}');
		console.log("Not connected: "+cmd);
		callback("*,0,*\n");
	}
}
//Remove a song from the current playlist
function removeFromList(msg) {
	console.log("removeFromList: "+msg);
	var request=JSON.parse(msg);
	audioboxDB.removeFromList(request);
}
//Get the songs in a crate for review/browse
function getCrateForReview(msg) {
	console.log("getCrateForReview: "+msg);
	var request=JSON.parse(msg);
	audioboxDB.getCrateForReview(request);
}

//Create a new crate to be used to classify songs
function createCrate(msg) {
	console.log("createCrate: "+msg);
	var request=JSON.parse(msg);
	audioboxDB.createCrate(request);
}

//Create a new playlist with random songs
function randomList() {
	console.log("randomList.");
	//Tell the browser that nothing is playing now
	io.emit("clearCurrentPlaying",'');
	audioboxDB.makeRandomPlaylist();
}

//Skip forward or backward
function doSkip(msg) {
	//We don't really need to return anything to the browser.	
	var request=JSON.parse(msg);
	console.log("doSkip: "+msg);
	var playing=audioboxDB.getSongPlaying();
	//In any case, we need to tell the model to move it's pointer
	audioboxDB.skipSong(request.direction);
	if (playing[0]=='*') {
		//If LiquidSoap isn't running, then we are done.
		return;
	}
	//Regrdless of which way we skip - we tell LiquidSoap to SKIP the rest of the current track
	sendTelnet("localAudio.skip", function(response) {
		console.log("Skip: "+response);
		if (playing[0]=='p') {
			//For some reason, if LiquidSoap is 'stopped', it needs TWO starts to actually start playing
			//Since we are paused.. we will give one here.. then the second one when the browser tells us to start for real.
			sendTelnet("localAudio.start", function(ignore) {
			});
		} else {
			//Sometimes LiquidSoap doesn't seem to want to continue playing after a skip.. so we need to check
			sendTelnet("localAudio.status", function(response) {
				console.log("Status check: "+response);
				var lines=response.split("\n");
				if (lines[0]=="off") {
					//Dang. it didn't keep playing.. kick it
					sendTelnet("localAudio.start",function(ignore) {
					});
				}
			});
		}
	});
}

//Start/stop the player
function startStop(msg) {
	var request=JSON.parse(msg);
	console.log("startStop: "+msg);
	//This can get complicated.. :)
	//First we need to get the current state of LiquidSoap
	sendTelnet("localAudio.status",function(response) {
		var lines=response.split('\n');
		var cmd='';
		if (lines[0]=='on') {
			if (request.makeit=='stop') {
				//It is currently playing a song.. so we just need to stop it.
				cmd='localAudio.stop';
			} else {
				//It is currently playing a song and they think it is stopped, so we just need to tell them what is playing
				cmd='audiobox.getid';
			}
		} else if (lines[0]=='off') {
			if (request.makeit=='start')  {
				//It is currently stopped.. so we need to start it.. but we also need to get the remaining time, etc.
				cmd='audiobox.getid';
			} else {
				//It is currently stopped, and they want it stopped.. so we are done
				cmd='';
			}
		} else if (request.makeit=='start') {
			//It has never been started - so we need to hard start it (and this will trigger the song started process)
			cmd='audiobox.start';
		} else {
			//It has never been started.. and they want it stopped... so we are done
			cmd='';
		}
		if (request.makeit=='stop') {
			//If we are stopping, then there is no DB call to emit the event back to the browser
			io.emit("songStopped",'');
		}
		if (cmd!='') {
			sendTelnet(cmd,function(response) {
				console.log("startStop: "+cmd);
				console.log(response);
				//If we are 'restarting', we have some more work to do.
				if (cmd=='audiobox.getid') {
					var lines=response.split('\n');
					lines=lines[0].split(",");
					//Next, etc. are already set - we are up and running
					//We need to tell the model that LiquidSoap will be running
					audioboxDB.setSongPlaying("r", lines[0]);
					//Then tell LiquidSoap to actually start running
					sendTelnet("localAudio.start",function(ignored) {
						//Then send the information off to the browser
						lines[1]=Math.floor(lines[1]);				//With a new run time remaining
						console.log("Restarting: "+lines[0]+" : "+lines[1]);
						audioboxDB.getSongStarted(lines[1]);		//This will issue a 'songStarted"
					});
				}
			});
		}
	});
}

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
	audioboxDB.getSongCrates(request);
}
//When the user changes the crates to put a song in
function cratesChanged(msg) {
	console.log('cratesChanged: '+msg);
	var request=JSON.parse(msg);
	audioboxDB.cratesChanged(request);
}
//When the browser wants the complete list of crates
function getCratesList() {
    console.log('getCratesList.');
    audioboxDB.getCratesList();
}
function getCratesListReview() {
    console.log('getCratesListReview.');
    audioboxDB.getCratesListReview();
}

//When the user changes the rating for the currently playing song
function ratingChanged(msg) {
	console.log('ratingChanged: '+msg);
	var request=JSON.parse(msg);
	audioboxDB.ratingChanged(request);
}

//When we want to save the current list with a name (it could be a replace)
//We don't bother returning anything, since nothing in the display changed.
function saveCurrentList(msg) {
    console.log('saveCurrentList: ' + msg);
    var request=JSON.parse(msg);
    audioboxDB.saveCurrentList(request.named);
}
//When they select a playlist to make 'current'
function replaceCurrentList(msg) {
    console.log('replaceCurrentList: ' + msg);
    var request=JSON.parse(msg);
	//Tell the browser that nothing is playing now
	io.emit("clearCurrentPlaying",'');
    sendTelnet("audiobox.stop", function (ignore) {
    	audioboxDB.setSongPlaying("*", "");
	    audioboxDB.replaceCurrentList(request);
	});
}
//When we are asked to empty the current list
function emptyCurrentList() {
    console.log('emptyCurrentList.');
	//Tell the browser that nothing is playing now
	io.emit("clearCurrentPlaying",'');
    sendTelnet("audiobox.stop", function (ignore) {
    	audioboxDB.setSongPlaying("*", "");
    	audioboxDB.emptyCurrentList();
    });
}
//When we are asked for the current song list
function getCurrentPlaylist() {
    console.log('getCurrentPlaylist.');
    audioboxDB.getCurrentPlaylist("simple");
}
//When we want to get a list of all the playlists we have defined
function getPlaylists() {
	console.log("getPlaylists.");
	audioboxDB.getPlaylists();
}
//When we want to just get a list of all playlist names
function getPlaylistNames() {
	console.log("getPlaylistNames.");
	audioboxDB.getPlaylistNames();
}
//When we want to get a playlist to review the contents over on the right side.
function getForReview(msg) {
	console.log('getForReview: '+msg);
	var request=JSON.parse(msg);
	audioboxDB.getForReview(request);
}
//Do the search of the database
function doSearch(msg) {
	console.log('doSearch: '+msg);
	var request=JSON.parse(msg);
	audioboxDB.doSearch(request);
}
function updatePlaylist(msg) {
	console.log('updatePlaylist: '+msg);
	var request=JSON.parse(msg);
	request.type="update";
	audioboxDB.updatePlaylist(request);
}
