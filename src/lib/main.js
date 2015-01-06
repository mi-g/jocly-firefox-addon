/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//require("sdk/preferences/service").set("javascript.options.strict", false);

var pageMod = require("sdk/page-mod");
var self = require("sdk/self");
var simpleStorage = require("sdk/simple-storage");
var simplePrefs = require('sdk/simple-prefs');
var windowUtils = require("sdk/window/utils");
const { merge } = require("sdk/util/object");
var _ = require("sdk/l10n").get;
var Request = require("sdk/request").Request;

var fapush = require('fapush/fapush.js');
var ui = require('ui.js');
var hots = require('hots.js');
var PJNParser = require('pjn-parser.js').PJNParser;

const _d = "draughts", _ed = "english-draughts";
const autoGameMoves = {
	'31-26': _d, '31-27': _d, '32-27': _d, '32-28': _d, '33-28': _d, 
	'33-29': _d, '34-29': _d, '34-30': _d, '35-30': _d,
	'9-13': _ed, '9-14': _ed, '10-14': _ed, '10-15': _ed,
	'11-15': _ed, '11-16': _ed, '12-16': _ed,
}

var pjnData = null;
var defaultGame;

function AnalyzePJN() {
    var valid=true;
    var gamesCount=0;
    defaultGame = null;
    PJNParser.parse(pjnData,function(game) {
    	if(!defaultGame && !game.tags.FEN && game.rootNode.next && game.rootNode.next.move && autoGameMoves[game.rootNode.next.move]) {
    		defaultGame=autoGameMoves[game.rootNode.next.move];
    	}
    	if(!defaultGame) {
        	var possibleGames=['english-draughts','draughts','classic-chess'];
    		var node=game.rootNode;
    		while(node) {
    			if(node.move) {
    				if(possibleGames.indexOf('classic-chess')>=0 && 
    						!/^[a-hRNBQKO][1-8a-hRNBQK=+xO\-!\?]+$/.test(node.move))
        				possibleGames.splice(possibleGames.indexOf('classic-chess'),1);
    				if(possibleGames.indexOf('draughts')>=0 || possibleGames.indexOf('english-draughts')>=0) {
    					if(!/^[1-9][0-9]*([\-x][1-9][0-9]*)+[\?!]*$/.test(node.move)) {
            				possibleGames.splice(possibleGames.indexOf('draughts'),1);        						
            				possibleGames.splice(possibleGames.indexOf('english-draughts'),1);        						
    					} else {
    						var poss=node.move.split(/\-x!\?/);
    						poss.every(function(pos) {
    							if(pos.length==0)
    								return true;
    							if(possibleGames.length==0)
    								return false;
    							var p=parseInt(pos);
    							if(possibleGames.indexOf('english-draughts')>=0 && (isNaN(p) || p<1 || p>32))
                    				possibleGames.splice(possibleGames.indexOf('english-draughts'),1);
    							if(possibleGames.indexOf('draughts')>=0 && (isNaN(p) || p<1 || p>50))
                    				possibleGames.splice(possibleGames.indexOf('draughts'),1);
    							return true;
    						});
    					}
    				}
    						
    			}
    			node=node.next;
				if(possibleGames.length==0)
					break;
    		}
        	if(possibleGames.length>0)
        		defaultGame=possibleGames[0];
        	else
        		valid=false;
    	}
    	gamesCount++;
    },function() {
    },function(error) {
    	valid=false;
    });
	if(valid && gamesCount>0 && defaultGame)
		return true;
	else
		return false;    
}

var cm = require("sdk/context-menu");
cm.Item({
	  label: _('view-pjn'),
	  contentScript: 'self.on("click", function() {' +
	  	'  self.postMessage("click");' +
	    '});',
	  onMessage: function(message) {
		  if(message=="click")
			  ui.openPJNViewer(pjnData,defaultGame || "classic-chess");
      },
      context: cm.PredicateContext(function(data) {
    	  if(!simplePrefs.prefs.viewpjn)
    		  return false;
    	  pjnData = data.selectionText;
    	  return AnalyzePJN();
      }),
	});

if(simpleStorage.storage.games)
	ui.setGames(simpleStorage.storage.games,simpleStorage.storage.groups);
else if(!simplePrefs.prefs.startseen) {
	simplePrefs.prefs.startseen = true;
	ui.goTo("/start");	
} else
	ui.goTo("/about");

var pushStarted = false;
function EnsuresPush() {
	if(!pushStarted) {
		pushStarted = true;
		fapush.init({
			onmessage: function(type,message) {
				if(type=="push")
					GetHots();
				if(type=="push-register")
					simpleStorage.storage.notifUser = null;
			},
		});
	}
}

function GetHots() {
	hots.get(function(aHots) {
		ui.setHots(aHots);
		ui.setButtonMode(aHots.length==0?'off':'on');		
	});
}

if(simpleStorage.storage.notifUser) {
	EnsuresPush();
	ui.setUser(simpleStorage.storage.notifUser,false);
	GetHots();
}

var pageWorkers = [];

pageMod.PageMod({
	include: new RegExp("^https\:\/\/"+simplePrefs.prefs.hostname.replace(/\./g,"\.")+"\/jocly\/plazza\/addon(?:#.*|\\?.*|$)"),
	contentScriptWhen: 'start',
	contentScriptFile: self.data.url("message-relay.js"),
	onAttach: function(worker) {
		pageWorkers.push(worker);
	    worker.port.emit("message",{ 
	    	type: "getGames" 
	    });
	    worker.on('detach',function() {
	    	var pwIndex=pageWorkers.indexOf(worker);
	    	if(pwIndex>=0)
	    		pageWorkers.splice(pwIndex,1);
	    	else
	    		console.worker("page worker not found")
	    });
	    worker.port.on("jocly-message",function(message) {
	    	switch(message.type) {
	    	case 'games':
	    		simpleStorage.storage.games = message.games;
	    		var groupAll = {
	    			name: 'all',
	    			title: _('all-games'),
	    			games: [],
	    		}
	    		for(var gameName in message.games)
	    			groupAll.games.push(gameName);
	    		message.groups.unshift(groupAll);
	    		simpleStorage.storage.groups = message.groups;
	    		ui.setGames(message.games,message.groups);
	    		break;
	    	case 'checkHots':
	    		GetHots();
	    		break;
	    	case 'setUser':
	    		var user = message.user;
	    		var notifUser = simpleStorage.storage.notifUser;
	    		if(user) {
	    			simpleStorage.storage.liveBaseURL = message.liveBaseURL;
	    			if(!notifUser || notifUser.uid!=user.uid) {
	    				if(notifUser)
							worker.port.emit("message",{
								type: "endpointUnregistered",
								endpoint: notifUser.endpoint,
								uid: notifUser.uid,
							});
						simpleStorage.storage.notifUser = notifUser = merge({},user);
	    				ClearPush(function() {
	    					RegisterPush(function(endpoint) {
	    						simpleStorage.storage.notifUser = merge({
	    							endpoint: endpoint,
	    						},notifUser);
	    						worker.port.emit("message",{
	    							type: "endpointRegistered",
	    							endpoint: endpoint,
	    							platform: "firefox-addon",
	    							uid: user.uid,
	    						});
	    					});
	    				});
		    		} else if(notifUser) 
						worker.port.emit("message",{
							type: "endpointRegistered",
							endpoint: notifUser.endpoint,
							platform: "firefox-addon",
							uid: notifUser.uid,
						});
		    		ui.setUser(user,true);
	    		} else
		    		ui.setUser(notifUser,false);	    			
	    		break;
	    	}
	    });
	}
});

function ClearPush(callback) {
	var out=1;
	function Done() {
		if(--out==0)
			callback();
	}
	EnsuresPush();
	var req = fapush.registrations();
	req.onsuccess = function(e) {
		e.target.result.forEach(function(reg) {
			out++;
			var req = fapush.unregister(reg.pushEndpoint);
			req.onsuccess = function() {
				Done();
			}
		});
		Done();		
	}
}

function RegisterPush(callback) {
	var req = fapush.register();
	req.onsuccess = function(e) {
		callback(e.target.result);
	}
}

function BroadcastToPages(message) {
	pageWorkers.forEach(function(worker) {
		worker.port.emit("message",message);			
	});
}

function ForgetUser() {
	function StopPush() {
		if(pushStarted) {
			pushStarted = false;
			fapush.destroy();
		}		
	}
	if(simpleStorage.storage.notifUser) {
		ui.setUser(null,false);
		ClearPush(function() {
			simpleStorage.storage.notifUser = null;	
			StopPush();
		});
	} else
		StopPush();
}

ui.init({
	broadcastToPages: BroadcastToPages,
	forgetUser: ForgetUser,
});

exports.onUnload = function(reason) {
	if(pushStarted) {
		pushStarted = false;
		fapush.destroy();
	}		
};
