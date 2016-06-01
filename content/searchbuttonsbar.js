/*
This file is part of Search Buttons Bar.
Search Buttons Bar is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
Search Buttons Bar is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with Search Buttons Bar. If not, see <http://www.gnu.org/licenses/>.
*/


/**
 * Controls the browser overlay for the Search Buttons Bar extension.
 */
var SearchButtonsBar = {
    searchService: Components.classes["@mozilla.org/browser/search-service;1"]
        .getService(Components.interfaces.nsIBrowserSearchService),
    prefs: Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService).getBranch("extensions.searchbuttonsbar."),

    submitSearch: function(event, inNewTab) {
        let engineName = event.target.getAttribute("label");
        let engine = SearchButtonsBar.searchService.getEngineByName(engineName);
        let searchQuery = document.getElementById("searchbar").value;
        let submission = engine.getSubmission(searchQuery);
        let inBackground = SearchButtonsBar.prefs.getBoolPref("loadInBackground");
        if (typeof inNewTab === "undefined") {
            let inNewTab = SearchButtonsBar.prefs.getBoolPref("openInNewTab");
        }
        openLinkIn(submission.uri.spec,
            inNewTab ? "tab" : "current", {
                postData: submission.postData,
                inBackground: inBackground,
                relatedToCurrent: true
            });
    },

    onFirstRun: function() {
        /* Move search bar to the toolbar when adddon is installed/enabled */
        let searchbuttonsbar = document.getElementById("SearchButtonsBar");
        let searchContainer = document.getElementById("search-container");
        let oldCurrentset = searchContainer.parentNode.getAttribute("currentset");
        searchContainer.parentNode.setAttribute("currentset", oldCurrentset.replace(/search-container,?/g, ""));
        searchbuttonsbar.setAttribute("currentset", "search-container,searchbuttonsbar-engines-container");
        searchbuttonsbar.parentNode.ownerDocument.persist(searchContainer.parentNode.id, "currentset");
        searchbuttonsbar.insertBefore(searchContainer, searchbuttonsbar.firstChild);
        searchbuttonsbar.parentNode.ownerDocument.persist(searchbuttonsbar.id, "currentset");
    },

    updateSearchEngines: function() {
        let enginesContainer = document.getElementById("searchbuttonsbar-engines-container");
        // Clear search engines container
        for (let i = enginesContainer.childNodes.length; i > 0; i--) {
            enginesContainer.removeChild(enginesContainer.childNodes[0]);
        }
        let onMiddleClick = function(e) {
            if (e.button === 1) {
                SearchButtonsBar.submitSearch(e, true);
            }
        };
        for (let engine of SearchButtonsBar.searchService.getEngines()) {
            let engineButton = document.createElement("toolbarbutton");
            engineButton.setAttribute("label", engine.name);
            engineButton.setAttribute("accesskey", engine.name[0]);
            engineButton.setAttribute("tooltiptext", engine.description);
            engineButton.addEventListener("command", SearchButtonsBar.submitSearch);
            engineButton.addEventListener("click", onMiddleClick);
            engineButton.setAttribute("image", engine.iconURI.scheme + ":" + engine.iconURI.path);
            enginesContainer.appendChild(engineButton);
        }
    },

    makeSearchContainerResizable: function() {
        let searchbuttonsbar = document.getElementById("SearchButtonsBar");
        let searchContainer = searchbuttonsbar.querySelector("#search-container");
        if (searchContainer === null)
            return;
        let createSplitter = function() {
            let splitter = document.createElement("splitter");
            splitter.setAttribute("resizebefore", "flex");
            splitter.setAttribute("resizeafter", "flex");
            splitter.setAttribute("skipintoolbarset", "true");
            splitter.setAttribute("class", "chromeclass-toolbar-additional searchbuttonsbar-splitter");
            splitter.addEventListener("command", function() {
                SearchButtonsBar.prefs.setIntPref("search-container-width", searchContainer.width);
            });
            return splitter;
        };
        // Add splitters both sides and re-use existing splitters e.g. when search bar is moved
        // splitters are used to resize the search bar container
        let splitters = searchbuttonsbar.querySelectorAll(".searchbuttonsbar-splitter");
        if (splitters.length === 2) {
            searchbuttonsbar.insertBefore(splitters[0], searchContainer);
            searchbuttonsbar.insertBefore(splitters[1], searchContainer.nextSibling);
        } else {
            searchbuttonsbar.insertBefore(createSplitter(), searchContainer);
            searchbuttonsbar.insertBefore(createSplitter(), searchContainer.nextSibling);
        }
        // restore resized width
        searchContainer.width = SearchButtonsBar.prefs.getIntPref("search-container-width");
    },

    init: function() {
        // Preparations on the first run of the addon
        if (!SearchButtonsBar.prefs.getBoolPref("firstRunDone")) {
            SearchButtonsBar.prefs.setBoolPref("firstRunDone", true);
            SearchButtonsBar.onFirstRun();
        }

        // Initialize search toolbar
        SearchButtonsBar.searchService.init(SearchButtonsBar.updateSearchEngines);
        SearchButtonsBar.makeSearchContainerResizable();

        // Add observer for search engine modified topic
        Services.obs.addObserver({
            observe: function(aSubject, aTopic, aData) {
                if (aTopic == "browser-search-engine-modified") {
                    SearchButtonsBar.updateSearchEngines();
                }
            }
        }, "browser-search-engine-modified", false);

        // Re-do search container init on toolbar customization
        window.addEventListener("aftercustomization", SearchButtonsBar.makeSearchContainerResizable);

        // Remove addon prefs and restore search container position on uninstall
        let uninstallObserver = new gObserver("quit-application", function(subject, topic, data) {
            // delete prefs
            let prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService);
            prefs.deleteBranch("extensions.searchbuttonsbar.");
            // restore search bar position
            let navbar = document.getElementById("nav-bar");
            let currentset = navbar.getAttribute("currentset");
            navbar.setAttribute("currentset", currentset.replace(/urlbar-container/, "urlbar-container,search-container"));
            navbar.parentNode.ownerDocument.persist(navbar.id, "currentset");
        });
        Components.utils.import("resource://gre/modules/AddonManager.jsm");
        AddonManager.addAddonListener({
            onUninstalling: function(addon, needsRestart) {
                if (addon.id == "searchbuttonsbar@jumba-forum.palemoon.org") {
                    uninstallObserver.register();
                }
            },
            onOperationCancelled: function(addon, needsRestart) {
                if (addon.id == "searchbuttonsbar@jumba-forum.palemoon.org") {
                    uninstallObserver.unregister();
                }
            }
        });
    }
};

var gObserver = function(topic, callback) {
    this.topic = topic;
    this.observe = callback;
};
gObserver.prototype = {
    register: function() {
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);
        observerService.addObserver(this, this.topic, false);
    },
    unregister: function() {
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);
        observerService.removeObserver(this, this.topic);
    }
};

window.addEventListener("load", SearchButtonsBar.init, true);
