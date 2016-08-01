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

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

/**
 * Controls the browser overlay for the Search Buttons Bar extension.
 */
var SearchButtonsBar = {
    searchService: Components.classes["@mozilla.org/browser/search-service;1"]
        .getService(Components.interfaces.nsIBrowserSearchService),
    prefs: Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService).getBranch("extensions.searchbuttonsbar."),

    submitSearch: function(event, forceInNewTab) {
        let engineName = event.target.getAttribute("label");
        let engine = SearchButtonsBar.searchService.getEngineByName(engineName);
        let searchQuery = document.getElementById("searchbar").value;
        let submission = engine.getSubmission(searchQuery);
        let inNewTab = SearchButtonsBar.prefs.getBoolPref("openInNewTab");
        let inBackground = SearchButtonsBar.prefs.getBoolPref("loadInBackground");
        let nextToCurrent = SearchButtonsBar.prefs.getBoolPref("nextToCurrent");
        let tabsInsertRelated = Services.prefs.getBoolPref("browser.tabs.insertRelatedAfterCurrent");
        let changedRelatedPref = false;

        if (typeof forceInNewTab === "boolean") {
            inNewTab = forceInNewTab;
        }

        if (nextToCurrent && !tabsInsertRelated) {
            Services.prefs.setBoolPref("browser.tabs.insertRelatedAfterCurrent", true);
            changedRelatedPref = true;
        }

        openLinkIn(submission.uri.spec,
            inNewTab ? "tab" : "current", {
                postData: submission.postData,
                inBackground: inBackground,
                relatedToCurrent: nextToCurrent
            }
        );

        if (changedRelatedPref) {
            Services.prefs.setBoolPref("browser.tabs.insertRelatedAfterCurrent", false);
        }
    },

    onMiddleClick: function(e) {
        if (e.button === 1) {
            SearchButtonsBar.submitSearch(e, true);
        }
    },

    onFirstRun: function() {
        /* Move search bar to the toolbar when adddon is installed */
        try {
            // Use CustomizableUI if it exists
            Components.utils.import("resource:///modules/CustomizableUI.jsm");
            CustomizableUI.addWidgetToArea("search-container", "SearchButtonsBar", 0);
        } catch (err) {
            // Otherwise fallback to manual method
            let searchbuttonsbar = document.getElementById("SearchButtonsBar");
            let searchContainer = document.getElementById("search-container");

            // Get the toolbar parent
            let oldParent = findParentByType(searchContainer, "toolbar");

            if (oldParent.hasAttribute("currentset")) {
                oldParent.setAttribute("currentset", oldParent.getAttribute("currentset").replace(/search-container,?/g, ""));
            } else {
                oldParent.setAttribute("currentset", oldParent.getAttribute("defaultset").replace(/search-container,?/g, ""));
            }
            oldParent.ownerDocument.persist(oldParent.id, "currentset");
            searchbuttonsbar.setAttribute("currentset", "search-container,searchbuttonsbar-engines-container");
            searchbuttonsbar.ownerDocument.persist(searchbuttonsbar.id, "currentset");
            searchbuttonsbar.insertBefore(searchContainer, searchbuttonsbar.firstChild);
        }
    },

    updateSearchEngines: function() {
        let enginesContainer = document.getElementById("searchbuttonsbar-engines-container");
        if (!enginesContainer) {
            return;
        }
        let searchEngines = SearchButtonsBar.searchService.getVisibleEngines();
        let hiddenEngines = SearchButtonsBar.prefs.getCharPref("hidden").split(",").reduce(function(map, engine) {
            map[engine] = true;
            return map;
        }, {});
        let displayMode = SearchButtonsBar.prefs.getCharPref("mode");

        // Clear search engines container
        for (let i = enginesContainer.childNodes.length; i > 0; i--) {
            enginesContainer.removeChild(enginesContainer.childNodes[0]);
        }
        for (let engine of searchEngines) {
            if (hiddenEngines[engine.name]) {
                continue;
            }
            let engineButton = document.createElementNS(XUL_NS, "toolbarbutton");
            engineButton.setAttribute("class", "searchbuttonsbar-enginebutton");
            engineButton.setAttribute("label", engine.name);
            engineButton.setAttribute("accesskey", engine.name[0]);
            engineButton.setAttribute("tooltiptext", engine.description);
            engineButton.addEventListener("command", SearchButtonsBar.submitSearch);
            engineButton.addEventListener("click", SearchButtonsBar.onMiddleClick);
            engineButton.setAttribute("image", (engine.iconURI ? engine.iconURI.spec : "chrome://searchbuttonsbar/skin/search-engine-placeholder.png"));
            enginesContainer.appendChild(engineButton);
        }

        // set buttons display mode
        enginesContainer.setAttribute("mode", displayMode);

        // set listener for display mode preference
        let _prefService = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefBranch2);
        _prefService.addObserver("extensions.searchbuttonsbar.mode", {
            observe: function(aSubject, aTopic, aData) {
                let newDisplayMode = Services.prefs.getCharPref(aData);
                enginesContainer.setAttribute("mode", newDisplayMode);
                SearchButtonsBar.addOverflowSupport();
            }
        }, false);

        // Add search buttons overflow support
        let overflowButton = document.createElementNS(XUL_NS, "toolbarbutton");
        let overflowMenuPopup = document.createElementNS(XUL_NS, "menupopup");
        overflowButton.setAttribute("type", "menu");
        overflowButton.setAttribute("label", "…");
        overflowButton.setAttribute("id", "searchbuttons-overflow-button");
        overflowMenuPopup.setAttribute("id", "searchbuttons-overflow-menu-popup");
        overflowButton.appendChild(overflowMenuPopup);
        enginesContainer.insertBefore(overflowButton, enginesContainer.firstChild);
        // delay adding overflow support to detect width of elements correctly
        // TODO: better solution?
        window.setTimeout(function() {
            SearchButtonsBar.addOverflowSupport();
        }, 10);
    },

    makeSearchContainerResizable: function() {
        let searchbuttonsbar = document.getElementById("SearchButtonsBar");
        let searchContainer = searchbuttonsbar.querySelector("#search-container");
        let searchbar = document.getElementById("searchbar");
        if (searchContainer === null)
            return;
        // Add splitters both sides and re-use existing splitters e.g. when search bar is moved
        // splitters are used to resize the search bar container
        let splitters = searchbuttonsbar.querySelectorAll(".searchbuttonsbar-splitter");
        if (splitters.length === 2) {
            searchbuttonsbar.insertBefore(splitters[0], searchContainer);
            searchbuttonsbar.insertBefore(splitters[1], searchContainer.nextSibling);
        } else {
            searchbuttonsbar.insertBefore(createSplitter(searchContainer), searchContainer);
            searchbuttonsbar.insertBefore(createSplitter(searchContainer), searchContainer.nextSibling);
        }
        // restore resized width
        searchContainer.width = SearchButtonsBar.prefs.getIntPref("search-container-width");
        // add options menuitem
        let menuitem = window.document.createElementNS(XUL_NS, "menuitem");
        menuitem.setAttribute("class", "open-engine-manager");
        menuitem.setAttribute("id", "searchbuttonsbaroptions-menuitem");
        let stringBundle = document.getElementById("searchbuttonsbar-stringbundle");
        menuitem.setAttribute("label", stringBundle.getString("options.label"));
        menuitem.addEventListener("command", function() {
            openDialog("chrome://searchbuttonsbar/content/options.xul",
                "_blank", "chrome,dialog,modal,centerscreen,resizable");
        });
        if (searchbar._popup) {
            searchbar._popup.appendChild(menuitem);
        }
        // remove flex to allow resizing by pixels
        searchContainer.removeAttribute("flex");
    },

    addOverflowSupport: function() {
        let enginesContainer = document.getElementById("searchbuttonsbar-engines-container");
        if (!enginesContainer) {
            return;
        }
        let overflowMenu = document.getElementById("searchbuttons-overflow-menu-popup");
        let parentToolbar = findParentByType(enginesContainer, "toolbar");
        let contentWidth = getChildNodesWidth(parentToolbar);
        contentWidth -= enginesContainer.boxObject.width;
        contentWidth += getChildNodesWidth(enginesContainer);

        if (contentWidth > window.innerWidth) {
            contentWidth += 20; // add the overflow-button width
            let visibleEngines = [...enginesContainer.querySelectorAll(".searchbuttonsbar-enginebutton:not([hidden])")];
            while (contentWidth > window.innerWidth) {
                if (visibleEngines.length == 0)
                    break;
                let lastVisible = visibleEngines.pop();
                contentWidth -= lastVisible.boxObject.width;
                let iconWidth = lastVisible.boxObject.firstChild.boxObject.width;
                let labelWidth = lastVisible.boxObject.lastChild.boxObject.width;
                let paddingWidth = lastVisible.boxObject.width - iconWidth - labelWidth;
                if (paddingWidth < 0) paddingWidth = 0;
                lastVisible.setAttribute("overflow-icon-width", iconWidth);
                lastVisible.setAttribute("overflow-label-width", labelWidth);
                lastVisible.setAttribute("overflow-padding-width", paddingWidth);
                overflowMenu.insertBefore(buttonToMenuitem(lastVisible), overflowMenu.firstChild);
                lastVisible.setAttribute("hidden", "true");
            }
        } else {
            let hiddenEngines = [...enginesContainer.querySelectorAll(".searchbuttonsbar-enginebutton[hidden]")];
            // Set big flex value so that engines container gets expanded over other elements
            enginesContainer.setAttribute("flex", "1000");
            while (contentWidth < window.innerWidth) {
                if (hiddenEngines.length == 0)
                    break;
                if (hiddenEngines.length == 1) {
                    contentWidth -= 20; // remove the overflow-button width
                } else {
                    contentWidth += 20;
                }
                let firstHidden = hiddenEngines.shift();
                let displayMode = SearchButtonsBar.prefs.getCharPref("mode");
                if (displayMode == "icons" || displayMode == "full")
                    contentWidth += parseInt(firstHidden.getAttribute("overflow-icon-width"));
                if (displayMode == "text" || displayMode == "full")
                    contentWidth += parseInt(firstHidden.getAttribute("overflow-label-width"));
                //contentWidth += parseInt(firstHidden.getAttribute("overflow-padding-width"));
                if (contentWidth <= window.innerWidth) {
                    overflowMenu.removeChild(overflowMenu.firstChild);
                    firstHidden.removeAttribute("hidden");
                }
            }
        }
        if (overflowMenu.childNodes.length > 0) {
            enginesContainer.setAttribute("overflows", "true");
        } else {
            enginesContainer.removeAttribute("overflows");
            enginesContainer.setAttribute("flex", "1");
        }
    },

    init: function() {
        // Preparations on the first run of the addon
        if (!SearchButtonsBar.prefs.getBoolPref("firstRunDone")) {
            SearchButtonsBar.prefs.setBoolPref("firstRunDone", true);
            SearchButtonsBar.onFirstRun();
        }

        // Initialize search toolbar
        // If enginesContainer is not present wait for customizationchange event
        let enginesContainer = document.getElementById("searchbuttonsbar-engines-container");
        if (enginesContainer) {
            SearchButtonsBar.searchService.init(SearchButtonsBar.updateSearchEngines);
        } else {
            window.addEventListener("customizationchange", function() {
                window.removeEventListener("customizationchange", arguments.callee);
                SearchButtonsBar.searchService.init(SearchButtonsBar.updateSearchEngines);
            });
        }
        SearchButtonsBar.makeSearchContainerResizable();

        // Add observer for search engine modified topic
        Services.obs.addObserver({
            observe: function(aSubject, aTopic, aData) {
                if (aTopic == "browser-search-engine-modified") {
                    SearchButtonsBar.updateSearchEngines();
                }
            }
        }, "browser-search-engine-modified", false);
        // Add observer for searchbuttonsbar-modified topic
        Services.obs.addObserver({
            observe: function(aSubject, aTopic, aData) {
                if (aTopic == "searchbuttonsbar-modified") {
                    SearchButtonsBar.updateSearchEngines();
                }
            }
        }, "searchbuttonsbar-modified", false);

        // Re-do search container init on toolbar customization and window resize
        window.addEventListener("aftercustomization", SearchButtonsBar.makeSearchContainerResizable);
        window.addEventListener("aftercustomization", SearchButtonsBar.addOverflowSupport);
        addThrottledEvent("resize", "optimizedResize", window);
        window.addEventListener("optimizedResize", SearchButtonsBar.addOverflowSupport);

        // Remove addon prefs and restore search container position on uninstall
        let uninstallObserver = new Observer("quit-application", function(subject, topic, data) {
            // delete prefs
            let prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService);
            prefs.deleteBranch("extensions.searchbuttonsbar.");
            // restore search bar position
            let navbar = document.getElementById("nav-bar");
            if (!navbar.querySelector("#search-container")) {
                let currentset = navbar.getAttribute("currentset");
                navbar.setAttribute("currentset", currentset.replace(/urlbar-container/, "urlbar-container,search-container"));
                navbar.parentNode.ownerDocument.persist(navbar.id, "currentset");
            }
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

var Observer = function(topic, callback) {
    this.topic = topic;
    this.observe = callback;
};
Observer.prototype = {
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

function findParentByType(element, tag) {
    let parent = element.parentNode;
    if (!parent) return undefined;
    return (parent.localName == tag ? parent : findParentByType(parent, tag));
}

function createSplitter(searchContainer) {
    let splitter = document.createElementNS(XUL_NS, "splitter");
    splitter.setAttribute("resizebefore", "closest");
    splitter.setAttribute("resizeafter", "flex");
    splitter.setAttribute("skipintoolbarset", "true");
    splitter.setAttribute("class", "chromeclass-toolbar-additional searchbuttonsbar-splitter");
    splitter.addEventListener("command", function() {
        SearchButtonsBar.prefs.setIntPref("search-container-width", searchContainer.width);
    });
    return splitter;
}

function getChildNodesWidth(parent) {
    let contentWidth = 0;
    for (let child of parent.childNodes) {
        contentWidth += child.boxObject.width;
    }
    return contentWidth;
}

function buttonToMenuitem(button) {
    let menuitem = document.createElementNS(XUL_NS, "menuitem");
    menuitem.setAttribute("label", button.getAttribute("label"));
    menuitem.setAttribute("accesskey", button.getAttribute("accesskey"));
    menuitem.setAttribute("tooltiptext", button.getAttribute("tooltiptext"));
    menuitem.addEventListener("command", SearchButtonsBar.submitSearch);
    menuitem.addEventListener("click", SearchButtonsBar.onMiddleClick);
    menuitem.setAttribute("class", "menuitem-iconic");
    menuitem.setAttribute("image", button.getAttribute("image"));
    return menuitem;
}

function addThrottledEvent(type, name, obj) {
    obj = obj || window;
    let running = false;
    let func = function() {
        if (running)
            return;
        running = true;
        requestAnimationFrame(function() {
            obj.dispatchEvent(new CustomEvent(name));
            running = false;
        });
    };
    obj.addEventListener(type, func);
}

window.addEventListener("load", function load(event) {
    window.removeEventListener("load", load, false);
    SearchButtonsBar.init();
}, false);
