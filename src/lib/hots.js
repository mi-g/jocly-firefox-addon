/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var simpleStorage = require("sdk/simple-storage");
var Request = require("sdk/request").Request;

exports.get = function(callback) {
	var liveBaseURL = simpleStorage.storage.liveBaseURL;
	var notifUser = simpleStorage.storage.notifUser;
	if(!liveBaseURL || !notifUser)
		return;
	Request({
		url: simpleStorage.storage.liveBaseURL+"/hot?endpoint="+encodeURIComponent(notifUser.endpoint),
		onComplete: function(response) {
			if(response.json.status) {
				//console.info("################################################");
				//console.info("GetHots <=",response.json.result);
				var timeDiff = Date.now() - response.json.result.serverTime;
				response.json.result.hots.forEach(function(hot) {
					hot += hot.expiry;
				});
				var hots=response.json.result.hots;
				callback(hots);
			}
		},
	}).get();
}