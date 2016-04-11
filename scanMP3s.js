// AudioBox - a NODE audio player for the Raspberry Pi (or just about any linux)

//NOTE: This uses the SYNC versions of file reads since it's a single purpose application
var fs = require('fs');
var path = require('path');
var mm = require('musicmetadata');
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('./db/audioboxdb.sqlite',sqlite3.OPEN_READWRITE);

//These are the directories to start the searchs in.
var dirs = ["/mnt/remotemusic/Various/","/mnt/remotemusic/CustomAlbums/"];
var dirs = ["/mnt/remotemusic/Various/"];
var dirs = ["/mnt/remotemusic/CustomAlbums/"];

function scanDir(root, fileCb, doneCb) {
    fs.readdir(root, function processDir(err, files) {
        if (err) {
            fileCb(err);
        } else {
            if (files.length > 0) {
				var filename=files.shift();
                var file = path.join(root,filename);
                fs.stat(file, function processStat(err, stat) {
                    if (err) {
                        doneCb(err);
                    } else {
                        if (stat.isFile()) {
							var fileinfo={
								dir: root,
								name: filename,
								ctime : stat.ctime,
								mtime : stat.mtime
							}
                            fileCb(fileinfo, function(err) {
                                if (err) {
                                    doneCb(err);
                                } else {
                                    processDir(false, files);
                                }
                            });
                        } else {
                            scanDir(file, fileCb, function(err) {
                                if (err) {
                                    doneCb(err);
                                } else {
                                    processDir(false, files);
                                }
                            });
                        }
                    }
                });
            } else {
                doneCb(false);
            }
        }
    });
}

var rootidx=0;								//Start at the first of the 'root' directories
scanDir(dirs[rootidx],getID3, getNextDir);

//We are done chasing 'down' all the files in a root directory.
function getNextDir(err) {
	console.log("Finished: "+dirs[rootidx]);
	if (err) {
		console.log("Error return: "+err);
		process.exit(1);
	}
	rootidx++;								//Bump to next directory
	if (rootidx<dirs.length) {
		//And repeat the process for that 'root'
		scanDir(dirs[rootidx],getID3, getNextDir);
	}
}
//This is called each time we get a file.  when we are done with it, we call getNextFile
function getID3(fileinfo,getNextFile) {
	if (path.extname(fileinfo.name).toLowerCase()=='.mp3') {
		console.log("MP3: ",fileinfo.name);
		var file=path.join(fileinfo.dir,fileinfo.name);
		mm(fs.createReadStream(file),  { duration: true }, function (err, metadata) {
			if (err) {
				console.log("Error reading %s: %j", file, err);
			} else {
				//console.log(metadata);
				var values=[];
				if (metadata.year>0) {values.push(metadata.year);} else {values.push(0);}
				if (metadata.track) {values.push(metadata.track.no)} else {values.push(0);}
				if (metadata.duration) {values.push(metadata.duration)} else {values.push(0);}
				values.push(metadata.artist[0]);
				values.push(metadata.title);
				values.push(metadata.album);
				values.push(metadata.genre[0]);
				values.push(fileinfo.mtime.getTime());
				values.push(fileinfo.ctime.getTime());
				values.push(fileinfo.name);
				values.push(fileinfo.dir);
				var sql="INSERT INTO Library (year,track_number,duration,artist,title,album,genre,modified_time,change_time,filename,directory) VALUES(?,?,?,?,?,?,?,?,?,?,?)";
				db.run(sql,values,function(result) {
					if (result) {
						console.log(result);
						process.exit(2);
					} else {
						console.log("Inserted: "+metadata.title+" at: "+this.lastID);
						//process.exit(2);
						//Now we can go get the next file
						getNextFile(false);
					}
				});
			}
		});
	} else {
		console.log("Not an MP3: ",fileinfo.name);
		getNextFile(false);
	}
}

