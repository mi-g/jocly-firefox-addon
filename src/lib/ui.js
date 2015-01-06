/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { modelFor } = require("sdk/model/core");
var { viewFor } = require('sdk/view/core');
var self = require("sdk/self");
var panels = require("sdk/panel");
var tabs = require("sdk/tabs");
var tabsUtil = require("sdk/tabs/utils");
var windowUtils = require("sdk/window/utils");
var simplePrefs = require('sdk/simple-prefs');
var _ = require("sdk/l10n").get;
var notifications = require("sdk/notifications");
var hots = require('hots.js');
var querystring= require('sdk/querystring');
var { Cc, Ci } = require("chrome");

var ui = {
	actionButton: null,
	games: {},
	groups: [],
	user: null,
	userLogged: false,
	hots: {},
	panel: null,
}
	
exports.init = function(options) {
	
	ui.options = options || {};
	
    var { ActionButton } = require("sdk/ui");
    ui.actionButton = ActionButton({
      id: "jocly-button",
      label: "Jocly",
      icon: "./images/icon-18-off.png",
      onClick: exports.togglePanel,
    });
}

exports.setButtonMode = function SetButtonMode(mode) {
	
	switch(mode) {
	case 'off':
		ui.actionButton.icon = "./images/icon-18-off.png";
		break;
	case 'on':
		ui.actionButton.icon = simplePrefs.prefs.animatedicon?"./images/icon-18.apng":"./images/icon-18.png";
	break;
	}
}

exports.setGames = function SetGames(aGames,aGroups) {
	ui.games = aGames;
	ui.groups = aGroups;
	if(ui.panel && ui.panel.isShowing)
		panel.port.emit("contentMessage",{
			type: "multiset",
			data: [{
				name: "games",
				value: ui.games,
			},{
				name: "groups",
				value: ui.groups,				
			}]
		});
}

function InstantNotify(hot) {
	notifications.notify({
		title: _('jocly-notification'),
		text: hot.text,
		iconURL: ui.games[hot.game].thumbnail,
		onClick: function() {
			if(hot.status=='playing')
				exports.goTo("/live/"+hot.id);
			else if(hot.status=='invitation')
				exports.goTo("/invitation/"+hot.id);
		}
	});
}

exports.setUser = function SetUser(aUser,aUserLogged) {
	ui.user = aUser;
	ui.userLogged = aUserLogged;
	if(ui.panel && ui.panel.isShowing)
		ui.panel.port.emit("contentMessage",{
			type: "multiset",
			data: [{
				name: "user",
				value: ui.user,				
			},{
				name: "userLogged",
				value: ui.userLogged,								
			}]
		});
}

exports.setHots = function(aHots) {
	var oldHots=ui.hots;
	ui.hots={}
	aHots.forEach(function(hot) {
		ui.hots[hot.id]=hot;
		if(hot.status=='invitation') {
			hot.text = _('you-were-invited',hot.creator.name,ui.games[hot.game].title);
			hot.link = BaseURL()+"#/invitation/"+hot.id;
		} else if(hot.status=='playing') {
			hot.text = _('your-turn-to-play',ui.games[hot.game].title,hot.creator.name);
			hot.link = BaseURL()+"#/live/"+hot.id;
		}
		if(!oldHots[hot.id])
			InstantNotify(hot);
	});
	if(ui.panel && ui.panel.isShowing)
		ui.panel.port.emit("contentMessage",{
			type: "set",
			name: "hots",
			value: ui.hots,				
		});
}

function PanelShowOpts() {
	var window = windowUtils.getToplevelWindow(windowUtils.getMostRecentBrowserWindow()).content;
	return {
		width: 314,
		height: window.innerHeight-12,
		position: ui.actionButton,
	}
}

function BaseURL() {
	return "https://"+simplePrefs.prefs.hostname+"/jocly/plazza/addon";
}

exports.togglePanel = function TogglePanel() {
	if(ui.panel) {
		if(ui.panel.isShowing)
			ui.panel.hide();
		else
			ui.panel.show(PanelShowOpts());
	} else {
		ui.panel = panels.Panel({
			contentURL: self.data.url('panel.html'),
			contentScriptFile: [
			    self.data.url("lib/angular.min.js"),
			    self.data.url("app-scope.js")],
			onHide: function() {
			},
			onShow: function() {
				ui.panel.port.emit("contentMessage",{
					type: "multiset",
					data: [{
						name: "games",
						value: ui.games,
					},{
						name: "groups",
						value: ui.groups,
					},{
						name: "user",
						value: ui.user,
					},{
						name: "userLogged",
						value: ui.userLogged,								
					},{
						name: "hots",
						value: ui.hots,								
					}],
				});
				hots.get(function(aHots) {
					exports.setHots(aHots);
					exports.setButtonMode(aHots.length==0?'off':'on');		
				});
			},
			onMessage: function(message) {
				switch(message.type) {
				case "selectGame":
					exports.goTo("/game/"+message.game);
					ui.panel.hide();
					break;
				case "selectTable":
					if(message.table.status=='playing')
						exports.goTo("/live/"+message.table.id);
					else if(message.table.status=='invitation')
						exports.goTo("/invitation/"+message.table.id);
					ui.panel.hide();
					break;
				case "checkHots":
					hots.get(function(aHots) {
						exports.setHots(aHots);
						exports.setButtonMode(aHots.length==0?'off':'on');		
					});
					break;
		    	case 'login':
					ui.panel.hide();
					exports.ensuresTab("/path",function(tab) {
						ui.options.broadcastToPages({
							type: "login",
						});
					});
		    		break;
		    	case 'logout':
					ui.panel.hide();
					ui.options.broadcastToPages({
						type: "logout",						
					});
		    		break;
		    	case 'forget':
					ui.panel.hide();
					ui.options.forgetUser();
		    		break;
				}
			},
		});
		ui.panel.show(PanelShowOpts());		
	}
}

exports.goTo = function(path) {
	var url = BaseURL();
	var gotTab=false;
	tabsUtil.getTabs(windowUtils.getMostRecentBrowserWindow()).every(function(tab) {
		if(/^([^#]*)/.exec(tabsUtil.getTabURL(tab))[1]==url) {
			var tabModel = modelFor(tab); 
			tabModel.url = url+"#"+path;
			tabModel.activate();
			gotTab = true;
			return false;
		}
		return true;
	});
	if(!gotTab)
		tabs.open({
			url: url+"#"+path,
		});
}

exports.ensuresTab = function(path,callback,window) {
	var url = BaseURL();
	var gotTab=null;
	tabsUtil.getTabs(windowUtils.getMostRecentBrowserWindow()).every(function(tab) {
		if(/^([^#]*)/.exec(tabsUtil.getTabURL(tab))[1]==url) {
			var tabModel = modelFor(tab); 
			tabModel.url = url+"#"+path;
			tabModel.activate();
			gotTab = tabModel;
			return false;
		}
		return true;
	});
	if(!gotTab)
		tabs.open({
			url: url+"#"+path,
			onReady: function OnOpen(tab) {
				callback(tab);
			},
		});
	else
		callback(gotTab);
}

exports.openPJNViewer = function(pjnData,defaultGame) {
	tabs.open({
		url: "about:blank",
		onOpen: function(tab) {
			var params={
				pjn: pjnData,
				game: defaultGame
			}
            var stringStream= Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
            stringStream.data= querystring.stringify(params);
            var postData= Cc["@mozilla.org/network/mime-input-stream;1"].createInstance(Ci.nsIMIMEInputStream);
            postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
            postData.addContentLength = true;
            postData.setData(stringStream);
            var url="https://"+simplePrefs.prefs.hostname+"/jocly/plazza/pjn-viewer";
            tabsUtil.getBrowserForTab(viewFor(tab)).loadURIWithFlags(url, 0, null, null, postData);
		}
	});
}

exports.destroy = function(reason) {
}


