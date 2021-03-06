let addedWebsitesPatterns = [];

function urlToPattern(url)
{
	return ( url + (url[url.length - 1] != "/" ? "/" : "") + "*" );
}

chrome.storage.sync.get({"adminerWebsites": []}, function (result) {
	addedWebsitesPatterns = result.adminerWebsites.map(function (w) {
		return urlToPattern(w);
	});
});

chrome.runtime.onInstalled.addListener(() => {

	chrome.contextMenus.create({
		"id": "ah-ctxmenu-save-script",
		"title": "Save Script",
		"contexts": ["selection", "editable"]
	});

});

function getSQLScripts(callback)
{
	chrome.storage.sync.get({"sqlScripts": []}, function (result) {
		var sqlScripts = result.sqlScripts;

		sqlScripts = sqlScripts.map(function (sqlScript) {
			let query = sqlScript;

			if(typeof(sqlScript) == 'object') {
				query = sqlScript['query'];
			} else {
				sqlScript = {
					'query': sqlScript,
				};
			}

			sqlScript['query'] = decodeURIComponent(query).replace(/\\n/g, "\n");

			return sqlScript;
		});

		if(typeof(callback) == "function") {
			callback(sqlScripts);
		}
	});
}

function formatSQLScriptsForUpdate(sqlScripts) {
	// Avoid duplicates:
	sqlScripts = sqlScripts.filter(function(value, index, array) {
		let query = typeof(value) == 'object' ? value['query'] : value;
		return array.findIndex(t => t.query == query) == index;
	});

	sqlScripts = sqlScripts.map(function (sqlScript) {
		sqlScript.query = encodeURIComponent(sqlScript.query);

		return sqlScript;
	});

	return sqlScripts;
}

function saveSQLScript(script, callback)
{
	getSQLScripts(function (sqlScripts) {
		// Avoid Empty values:
		if(script || false) {
			var formattedScript = script;
			let dateTime = new Date().toString();

			if(typeof(script) == 'object') {
				formattedScript['dateTime'] = dateTime;

				script = formattedScript['query'].trim();
			} else {
				formattedScript = {
					'query': script.trim(),
					'dateTime': dateTime,
				};
			}

			sqlScripts.push(formattedScript);
		}

		sqlScripts = formatSQLScriptsForUpdate(sqlScripts);

		chrome.storage.sync.set({ "sqlScripts": sqlScripts }, function () {
			getSQLScripts(callback);
		});
	});
}

function updateSQLScripts(sqlScripts, callback)
{
	sqlScripts = formatSQLScriptsForUpdate(sqlScripts);

	chrome.storage.sync.set({ "sqlScripts": sqlScripts }, function () {
		if(typeof(callback) == "function") {
			callback();
		}
	});
}

function selectSQLFromTextareaAndSave(tab)
{
	chrome.scripting.executeScript({
		"target": { "tabId": tab.id },
		"function": function () {
			return {
				'query': document.querySelector('[name="query"]').value,
				'website': location.origin + location.pathname,
			};
		}
	}, (result) => {
		var selectedSqlScript;

		if(result.length > 0 && typeof(result[0].result) != 'undefined') {
			selectedSqlScript = result[0].result;
		}

		if(typeof(selectedSqlScript) != 'undefined') {
			saveSQLScript(selectedSqlScript, (sqlScripts) => {
				//
			});
		}
	});
}

chrome.contextMenus.onClicked.addListener(function (info, tab) {
	if(info.menuItemId == "ah-ctxmenu-save-script") {
		if(typeof(info.selectionText) != "undefined" && info.selectionText.trim().length > 0) {
			chrome.scripting.executeScript({
				"target": { "tabId": tab.id },
				"function": function () {
					return {
						'query': window.getSelection().toString().replace(/\n/g, "\\n"),
						'website': location.origin + location.pathname,
					};
				}
			}, (result) => {
				var selectedSqlScript;

				if(result.length > 0 && typeof(result[0].result) != 'undefined') {
					selectedSqlScript = result[0].result;
				}

				if(typeof(selectedSqlScript) != 'undefined') {
					saveSQLScript(selectedSqlScript, (sqlScripts) => {
						//
					});
				}
			});
		}
	}
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	if(request.action == "get-sql-scripts") {
		getSQLScripts(sendResponse);

		return true;
	} else if(request.action == "save-sql-scripts") {
		updateSQLScripts(request.sqlScripts, sendResponse);

		return true;
	} else if(request.action == "save-textarea-input-script") {
		//

		return true;
	}
});

chrome.storage.onChanged.addListener(function (changes, namespace) {
	if(typeof(changes.adminerWebsites) != "undefined") {
		addedWebsitesPatterns = changes.adminerWebsites.newValue.map(function (w) {
			return urlToPattern(w);
		});
	}
});

chrome.runtime.onInstalled.addListener(function (details) {
	if(details.reason == chrome.runtime.OnInstalledReason.INSTALL) {
		chrome.tabs.create({
			url: chrome.runtime.getURL("options.html"),
		});
	}
});

async function ahExtensionInit()
{
	chrome.webNavigation.onCommitted.addListener(function (details) {
		if(typeof(details.url) != "undefined" && details.transitionType == "form_submit") {
			addedWebsitesPatterns.forEach(function (p) {
				if(details.url.match(new RegExp(p))) {
					var urlParams = new URLSearchParams(details.url);
					var sqlScript = urlParams.get("sql");

					if(sqlScript) {
						if(sqlScript.trim().length > 0) {
							saveSQLScript({
								'query': sqlScript,
								'website': details.url.substring(0, details.url.indexOf('?')),
							});
						}
					} else {
						chrome.tabs.query({ active: true, currentWindow: true }, function ([tab]) {
							if(typeof(tab.id) != 'undefined') {
								selectSQLFromTextareaAndSave(tab);
							}
						});
					}
				}
			});
		}
	});
}

ahExtensionInit();
