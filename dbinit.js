// AudioBox - a NODE audio player for the Raspberry Pi (or just about any linux)
//
//This code simply handles creating the Database and tables.
//
var sqlite3 = require('sqlite3').verbose();
//We need to open it in create mode so we can create it.
var db = new sqlite3.Database('./db/audioboxdb.sqlite',sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE);
//Let's check to make sure things aren't already defined.
var sql="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
db.all(sql,[], function(err,rows) {
	console.log(err);
	console.log(rows);
	if (rows.length==0) {
		//YEA... nothing there yet.. let's start creating.
		sql="CREATE TABLE Library (id INTEGER primary key,year INTEGER,track_number INTEGER,duration INTEGER,bitrate INTEGER DEFAULT 0,times_played INTEGER DEFAULT 0, rating INTEGER DEFAULT 0,artist VARCHAR(128),title VARCHAR(128),album VARCHAR(128),genre VARCHAR(64),modified_time DATETIME,change_time DATETIME,added_time DATETIME DEFAULT CURRENT_TIMESTAMP,filename VARCHAR(512),directory VARCHAR(512))";
		db.run(sql,[],function(result) {
			console.log("created Library: "+result);
		});
		sql="CREATE TABLE Crates (id INTEGER PRIMARY KEY,name VARCHAR(48) UNIQUE NOT NULL)";
		db.run(sql,[],function(result) {
			console.log("created Crates: "+result);
		});
		sql="CREATE TABLE Crate_Tracks (crate_id INTEGER NOT NULL REFERENCES Crates(id),track_id INTEGER NOT NULL REFERENCES Library(id),UNIQUE (crate_id, track_id))";
		db.run(sql,[],function(result) {
			console.log("created Crates_Tracks: "+result);
		});
		sql="CREATE TABLE Playlist_Tracks (id INTEGER primary key,playlist_id INTEGER  NOT NULL REFERENCES Playlists(id),track_id INTEGER  NOT NULL REFERENCES Library(id),position INTEGER)";
		db.run(sql,[],function(result) {
			console.log("created Playlist_Tracks: "+result);
		});
		sql="CREATE TABLE Playlists (id INTEGER primary key,name VARCHAR(48) UNIQUE NOT NULL,date_modified DATETIME DEFAULT CURRENT_TIMESTAMP)";
		db.run(sql,[],function(result) {
			console.log("created Playlist: "+result);
			//And we need to create 'the audiobox playlist' once the table is created.
			sql="INSERT INTO Playlists (name) VALUES (?)";
			db.run(sql,["AUDIOBOX CURRENT"],function(result) {
				console.log("Added AUDIOBOX CURRENT Playlist: "+this.lastID);
				db.close();
			});
		});		
	} else {
		console.log("Tables already exist");
	}
});