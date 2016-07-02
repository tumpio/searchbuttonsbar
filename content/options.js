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
 * Controls the preferences window overlay for the Search Buttons Bar extension.
 * Adds option to select which engines are shown in Search Buttons Bar.
 */
var SearchButtonsBarOptions = {
    searchService: Components.classes["@mozilla.org/browser/search-service;1"]
        .getService(Components.interfaces.nsIBrowserSearchService),
    prefs: Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService).getBranch("extensions.searchbuttonsbar."),
    observerService: Components.classes["@mozilla.org/observer-service;1"]
        .getService(Components.interfaces.nsIObserverService),
    init: function() {
        let enginesTree = document.getElementById("enginesTree");
        let enginesChildren = document.getElementById("enginesChildren");
        let engines = SearchButtonsBarOptions.searchService.getVisibleEngines();
        let hiddenEngines = SearchButtonsBarOptions.prefs.getCharPref("hidden").split(",").reduce(function(map, engine) {
            map[engine] = true;
            return map;
        }, {});
        enginesTree.view = new EngineView(engines, hiddenEngines);
    }
};

window.addEventListener("load", SearchButtonsBarOptions.init, true);

function EngineView(engines, hidden) {
    this.engines = engines;
    this.hiddenEngines = hidden;
}
// implements nsITreeView
EngineView.prototype = {
    engines: null,
    hiddenEngines: null,
    tree: null,
    selection: null,

    get rowCount() {
        return this.engines.length;
    },

    getImageSrc: function(index, column) {
        if (column.id == "engineName") {
            let engine = this.engines[index];
            return (engine.iconURI ? engine.iconURI.spec : "chrome://searchbuttonsbar/skin/search-engine-placeholder.png");
        }
        return "";
    },

    getCellText: function(index, column) {
        if (column.id == "engineName") {
            return this.engines[index].name;
        }
        return "";
    },

    setTree: function(tree) {
        this.tree = tree;
    },
    getRowProperties: function(index) {
        return "";
    },
    getCellProperties: function(index, column) {
        return "";
    },
    getColumnProperties: function(column) {
        return "";
    },
    isContainer: function(index) {
        return false;
    },
    isContainerOpen: function(index) {
        return false;
    },
    isContainerEmpty: function(index) {
        return false;
    },
    isSeparator: function(index) {
        return false;
    },
    isSorted: function(index) {
        return false;
    },
    getParentIndex: function(index) {
        return -1;
    },
    hasNextSibling: function(parentIndex, index) {
        return false;
    },
    getLevel: function(index) {
        return 0;
    },
    getProgressMode: function(index, column) {},
    getCellValue: function(index, column) {
        if (column.id == "engineShow") {
            return !this.hiddenEngines[this.engines[index].name];
        }
        return undefined;
    },
    toggleOpenState: function(index) {},
    cycleHeader: function(column) {},
    selectionChanged: function() {},
    cycleCell: function(row, column) {},
    isEditable: function(index, column) {
        return column.id == "engineShow";
    },
    isSelectable: function(index, column) {
        return false;
    },
    setCellValue: function(index, column, value) {
        if (column.id == "engineShow") {
            let engine = this.engines[index];
            if(value == "true") {
                delete this.hiddenEngines[engine.name];
            } else {
                this.hiddenEngines[engine.name] = true;
            }
            SearchButtonsBarOptions.prefs.setCharPref("hidden", Object.keys(this.hiddenEngines).join());
            SearchButtonsBarOptions.observerService.notifyObservers(null, "searchbuttonsbar-modified", null);
            column.invalidate();
        }
    },
    setCellText: function(index, column, value) {},
    performAction: function(action) {},
    performActionOnRow: function(action, index) {},
    performActionOnCell: function(action, index, column) {}
};
