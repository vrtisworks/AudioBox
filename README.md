# AudioBox
A 'headless' Jukebox/Audio Player based on Node and LiquidSoap.

Specifically designed and tested on a Raspberry Pi B+ and a Raspberry Pi2

Since Node and LiquidSoap are available for Windows, OS/X and Linux, it should be possible to port this to other platforms.

This is not a simple install process, though all the pieces are available through normal install methods (either apititude/apt-get or npm).

1. Raspberry Pi B+ (or Pi2).
2. TheThingBox V1.8.0 (www.thethingbox.io) - base OS that I started from.  
   * You should be able to use other distributions, but this one is configured for a headless environment, so does not assume you have a monitor/keyboard attached.
3. If you have not done this.. please do.
   SSH as pi
   sudo passwd root => Change the root password
   passwd pi => Change the pi password
   sudo aptitude
	a) u=>update the package listings
	b) U=>mark for update
	c) g=>review changes
	d) g=>install changes
4) I created a new user to run the code under (vrtisworks - you are free to pick a different user)
   sudo adduser <user>
   (take the defaults, and give it a password)
   (you could run this under pi, but that has a bunch of other privilges)
5) Add the audio group to the new user (pi already has it, so you don't need to do this if you are going to use pi)
   sudo useradd -G audio vrtisworks
6) create a new directory to hold the code (I used /var/audiobox)
7) The latest release of TheThingBox has /tmp defined too small for the npm install of sqlite3.
   You can change it by sudo nano /etc/fstab (I changed the size=5m to size=100m)
   You will need to reboot after changing the size.
8) the repository does not contain any of the npm modules
   npm install express
   npm install socket.io 	(this will run 'a while')
   npm install sqlite3		(this will run a little longer)
   npm install telnet-client
9) You will need to create a directory to hold the SQLITE database file (I created /var/audiobox/db).
   Currently, I use a copy of the sqlite file created by MIXXX, it has the columns I need and the mp3
   scanner.
   I have a 'todo' to create my own code to load a new database that will eliminate some of the extra stuff.
   You will need to change the location of the database in public/js/audiobox_model.js to point to the database.
