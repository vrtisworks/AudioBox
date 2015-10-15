# AudioBox
A 'headless' Jukebox/Audio Player based on Node and LiquidSoap.

Specifically designed and tested on a Raspberry Pi B+ and a Raspberry Pi2

Since Node and LiquidSoap are available for Windows, OS/X and Linux, it should be possible to port this to other platforms.

This is not a simple install process, though all the pieces are available through normal install methods (either apititude/apt-get or npm).

1. Raspberry Pi B+ (or Pi2).
2. TheThingBox V1.8.0 (www.thethingbox.io) - base OS that I started from.  
   * You should be able to use other distributions, but this one is configured for a headless environment, so does not assume you have a monitor/keyboard attached.
3. If you have not done this.. please do.
   * SSH as pi
   * _sudo passwd root_ => Change the root password
   * _passwd pi_ => Change the pi password
   * _sudo aptitude_
	  * a) _u_=>update the package listings
	  * b) _U_=>mark for update
	  * c) _g_=>review changes
	  * d) _g_=>install changes
4. I created a new user to run the code under (vrtisworks - you are free to pick a different user)
   * _sudo adduser **<user>**_
   * (take the defaults, and give it a password)
   * (you could run this under pi, but that has a bunch of other privilges)
5. Add the audio group to the new user (pi already has it, so you don't need to do this if you are going to use pi)
   * _sudo useradd -G audio **<user>**_
6. create a new directory to hold the code (I used /var/audiobox)
7. The latest release of TheThingBox has /tmp defined too small for the npm install of sqlite3.
   * You can change it by _sudo nano /etc/fstab_ (I changed the size=5m to size=100m)
   * You will need to reboot after changing the size.
8. the repository does not contain any of the npm modules
   * _npm install express_
   * _npm install socket.io_ 	(this will run 'a while')
   * _npm install sqlite3_		(this will run a little longer)
   * _npm install telnet-client_
9. You will need to create a directory to hold the SQLITE database file (I created /var/audiobox/db).
   * Currently, I use a copy of the sqlite file created by MIXXX, it has the columns I need and the mp3
   scanner.
   * I have a 'todo' to create my own code to load a new database that will eliminate some of the extra stuff.
   You will need to change the location of the database in public/js/audiobox_model.js to point to the database.
