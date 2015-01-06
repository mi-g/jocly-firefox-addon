/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
	
	var ready = false;
	var backlog = [];

	window.addEventListener('message', function(event) {
		if(!event.data.fromContent)
			return;
		//console.info("from page script",event.data);
		if(event.data.type=='ready') {
			if(!ready) {
				ready=true;
				backlog.forEach(function(message) {
					window.postMessage(message,'*');				
				});
				backlog=null;
			}
		}
		self.port.emit("jocly-message",event.data);
	}, false);

	self.port.on("message",function(message) {
		//console.info("to page script",message,ready);
		if(!ready)
			backlog.push(message);
		else
			window.postMessage(message,'*');
	});

})();
