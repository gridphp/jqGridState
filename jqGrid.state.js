/**
 * JQGrid State Management Plugin
 * Persists grid settings (columns, filters, selections, etc.) across page refreshes
 * @author gridphp@gmail.com
 * 
 * Dependencies:
 * - json2.js: For JSON serialization/deserialization
 * - jstorage.js: For browser storage (wraps localStorage)
 * 
 * Changelog:
 * - Fix for multiselect dropdown reset in toolbar (30-oct-2025)
 * - Fix for multiselect dropdown (13-jul-2022)
 * - Fix for onSelectRow event (3-jun-15)
 * - Added toolbar search filter persistance (9-dec-14)
 * - It will persist various settings of jqGrid on page refresh
 * - It includes: column chooser display, search filters, row selection, subgrid expansion, pager, column order
 * - To enable, make set property to true when initializing object
 * - Revamped selection persistance, removed old version
 *
 * Useful links:
 *
 * http://stackoverflow.com/questions/19119122/trigger-search-for-jqgrid-filter-on-every-revisit-of-page
 * http://www.ok-soft-gmbh.com/jqGrid/ColumnChooserAndLocalStorage2_single.htm
 * http://www.ok-soft-gmbh.com/jqGrid/ColumnChooserAndLocalStorage2_.htm
 * http://stackoverflow.com/questions/8545953/how-to-persist-current-row-in-jqgrid
 * http://stackoverflow.com/questions/9308583/jqgrid-how-to-define-filter-presets-templates-inside-a-combo-box
 * http://www.google.com.pk/search?q=site:www.ok-soft-gmbh.com/jqGrid/+localstorage
 * 
 */

// ====================================================================================
// UTILITY FUNCTIONS
// ====================================================================================

// Non-model columns are special jqGrid columns that don't represent data
// cb = checkbox column, subgrid = subgrid expander, rn = row number
var nonModelColumns = ["cb", "subgrid", "rn"];

/**
 * Swaps two elements in an array
 * Used for reordering columns to match saved state
 */
function swap(key1, key2, arr) {
    if (typeof(arr[key1]) !== 'undefined' && typeof(arr[key2]) !== 'undefined') {
        var tmp = arr[key1];
        arr[key1] = arr[key2];
        arr[key2] = tmp;
    }
}

// ====================================================================================
// GRIDSTATE CONSTRUCTOR - Main state management object
// ====================================================================================

function GridState(options) {
    
    // ---------------------
    // PROPERTIES
    // ---------------------
    
    // Configuration: what aspects of state to persist
    this.stateOpts = {
        storageKey: null,    // Unique key for localStorage
        columns: false,      // Save column width/visibility/order?
        filters: false,      // Save search filters?
        selection: false,    // Save selected rows?
        expansion: false,    // Save expanded subgrid rows?
        pager: false,        // Save page number and rows per page?
        order: false         // Save sort column and direction?
    };
    
    // State data storage
    this.colsData = null;      // Column information
    this.filtersData = null;   // Filter rules
    this.pagerData = null;     // Pagination info
    this.orderData = null;     // Sort info
    this.selRows = [];         // Selected row IDs
    this.expRows = [];         // Expanded subgrid row IDs

    // ---------------------
    // SAVE METHOD
    // ---------------------
    
    /**
     * Saves current grid state to browser storage
     * @param {jQuery} grid - Optional grid object to refresh state from
     */
    this.save = function(grid) {
        // If grid provided, update state from current grid settings
        if (grid) {
            this.refreshOptions(grid);
            this.refresh(grid);
        }

        // Build object with only enabled state features
        var dataToSave = {};
        if (this.stateOpts.columns)
            dataToSave.colsData = this.colsData;
        if (this.stateOpts.filters)
            dataToSave.filtersData = this.filtersData;
        if (this.stateOpts.selection)
            dataToSave.selRows = this.selRows;
        if (this.stateOpts.expansion)
            dataToSave.expRows = this.expRows;
        if (this.stateOpts.pager)
            dataToSave.pagerData = this.pagerData;
        if (this.stateOpts.order)
            dataToSave.orderData = this.orderData;

        // Save to browser storage using jStorage
        jQuery.jStorage.set(this.stateOpts.storageKey, dataToSave);
        return this;
    };

    // ---------------------
    // LOAD METHOD
    // ---------------------
    
    /**
     * Loads saved state from browser storage
     * @param {string} storageKey - Optional storage key override
     */
    this.load = function(storageKey) {
        if (storageKey)
            this.stateOpts.storageKey = storageKey;

        if (this.stateOpts.storageKey) {
            var savedState = jQuery.jStorage.get(this.stateOpts.storageKey);
            if (savedState) {
                // Restore all saved state data
                this.colsData = savedState.colsData;
                this.filtersData = savedState.filtersData;
                this.selRows = savedState.selRows || [];
                this.expRows = savedState.expRows || [];
                this.pagerData = savedState.pagerData;
                this.orderData = savedState.orderData;
            }
        }

        return this;
    };

    // ---------------------
    // REMOVE METHOD
    // ---------------------
    
    /**
     * Clears saved state from storage and resets internal data
     */
    this.remove = function(storageKey) {
        jQuery.jStorage.deleteKey(storageKey || this.stateOpts.storageKey);

        // Reset all state data
        this.colsData = 
        this.filtersData = 
        this.pagerData = 
        this.orderData = null;
        this.selRows = [];
        this.expRows = [];
    };

    // ---------------------
    // APPLY METHOD
    // ---------------------
    
    /**
     * Applies saved state to an existing grid
     * (Currently a placeholder - not fully implemented)
     */
    this.apply = function(grid) {
        grid.gridState(this);
        // TODO: Apply saved state to already-created grid
    };

    // ---------------------
    // REFRESH METHOD
    // ---------------------
    
    /**
     * Updates internal state from current grid settings
     * @param {jQuery} grid - The grid to read state from
     */
    this.refresh = function(grid) {
        this.refreshOptions(grid);

        if (this.stateOpts.columns)
            this.refreshColumns(grid);
        if (this.stateOpts.filters)
            this.refreshFilters(grid);
        if (this.stateOpts.pager)
            this.refreshPagerData(grid);
        if (this.stateOpts.order)
            this.refreshOrderData(grid);

        return this;
    };

    // ---------------------
    // REFRESH OPTIONS
    // ---------------------
    
    /**
     * Updates stateOpts configuration from grid or options object
     */
    this.refreshOptions = function(gridOrOpts) {
        gridOrOpts = gridOrOpts || '';

        // Get options from grid params or direct object
        var opts = typeof(gridOrOpts) === 'string'
                   ? gridOrOpts
                   : jQuery.isFunction(gridOrOpts.getGridParams)
                     ? gridOrOpts.getGridParams('stateOptions')
                     : gridOrOpts;

        if (jQuery.isFunction(opts))
            opts = opts.call(gridOrOpts);

        // If string provided, use as storage key and enable all features
        if (typeof(opts) === 'string') {
            this.stateOpts.storageKey = opts;
            this.stateOpts.columns = this.stateOpts.filters =
            this.stateOpts.selection = this.stateOpts.expansion =
            this.stateOpts.pager = this.stateOpts.order = true;
        }
        // If object, merge with existing options
        else if (jQuery.isPlainObject(opts))
            jQuery.extend(this.stateOpts, opts);

        return this;
    };

    // ---------------------
    // REFRESH COLUMNS
    // ---------------------
    
    /**
     * Captures current column configuration (width, visibility, order)
     */
    this.refreshColumns = function(grid) {
        this.colsData = { count: 0, cols: {} };

        var nonModelColCount = 0;
        var colModel = grid.getGridParam('colModel');
        
        for (i = 0; i < colModel.length; i++) {
            // Skip special columns (checkbox, subgrid, row number)
            if (jQuery.inArray(colModel[i].name, nonModelColumns) != -1) {
                nonModelColCount++;
                continue;
            }

            this.colsData.count++;
            // Save column state indexed by column name
            this.colsData.cols[colModel[i].name] = {
                hidden: colModel[i].hidden,
                width: colModel[i].width,
                uiIndex: i - nonModelColCount  // Position in UI (excluding special cols)
            };
        }

        return this;
    };

    // ---------------------
    // REFRESH FILTERS
    // ---------------------
    
    /**
     * Captures current search filter configuration
     */
    this.refreshFilters = function(grid) {
        var prmNames = grid.getGridParam('prmNames');
        var postData = grid.getGridParam('postData');
        var sFilter = 'filters';  // Standard jqGrid filter parameter name
        
        if (sFilter) {
            var fltrData = postData[sFilter];
            var searchBtn = jQuery('div.ui-pg-div span.ui-icon.ui-icon-search');
            
            // If search is active, save filter data
            if (prmNames.search && postData[prmNames.search] && fltrData) {
                searchBtn.parent().addClass('ui-state-default ui-corner-all');
                this.filtersData = JSON.parse(fltrData);
            }
            // If filters exist but search is inactive
            else if (fltrData) {
                fltrData = JSON.parse(fltrData);
                // If no actual filter rules, clear saved filters
                if (fltrData.rules.length == 0) {
                    searchBtn.parent().removeClass('ui-state-default ui-corner-all');
                    this.filtersData = null;
                }
            }
        }

        return this;
    };

    // ---------------------
    // REFRESH PAGER DATA
    // ---------------------
    
    /**
     * Captures current pagination state
     */
    this.refreshPagerData = function(grid) {
        this.pagerData = {
            page: grid.getGridParam('page'),        // Current page number
            rowNum: grid.getGridParam('rowNum')     // Rows per page
        };

        return this;
    };

    // ---------------------
    // REFRESH ORDER DATA
    // ---------------------
    
    /**
     * Captures current sort configuration
     */
    this.refreshOrderData = function(grid) {
        this.orderData = {
            sortName: grid.getGridParam('sortname'),    // Column being sorted
            sortOrder: grid.getGridParam('sortorder')   // 'asc' or 'desc'
        };
        return this;
    };

    // ---------------------
    // UPDATE GRID OPTIONS
    // ---------------------
    
    /**
     * Applies saved state to grid initialization options
     * Called BEFORE grid is created
     */
    this.updateGridOptions = function(gridOpts) {
        
        // RESTORE COLUMNS
        if (this.stateOpts.columns && this.colsData && 
            this.colsData.count === gridOpts.colModel.length) {
            
            for (i = 0; i < gridOpts.colModel.length; i++) {
                var curState = this.colsData.cols[gridOpts.colModel[i].name];
                if (typeof(curState) === 'undefined' || curState == null)
                    continue;

                // Restore width and visibility
                gridOpts.colModel[i].width = curState.width;
                gridOpts.colModel[i].hidden = curState.hidden;

                // Restore column order by swapping
                if (curState.uiIndex != i) {
                    swap(curState.uiIndex, i, gridOpts.colModel);
                    if (gridOpts.colNames)
                        swap(curState.uiIndex, i, gridOpts.colNames);
                    i--;  // Re-check this position after swap
                }
            }
        }

        // RESTORE PAGER
        if (this.stateOpts.pager && this.pagerData) {
            gridOpts.page = this.pagerData.page;

            // Only restore rowNum if it's in the available options
            if (gridOpts.rowList && 
                jQuery.inArray(this.pagerData.rowNum, gridOpts.rowList))
                gridOpts.rowNum = this.pagerData.rowNum;
        }

        // RESTORE SORT ORDER
        if (this.stateOpts.order && this.orderData) {
            for (i = 0; i < gridOpts.colModel.length; i++)
                // Check column exists and is sortable, default sortable is true (undefined = true)
                if (gridOpts.colModel[i].name == this.orderData.sortName &&
                    gridOpts.colModel[i].sortable !== false) {
                    gridOpts.sortname = this.orderData.sortName;
                    gridOpts.sortorder = this.orderData.sortOrder;
                }
        }
        
        // RESTORE FILTERS
        // Set search flag and post filters with data request - azg
        if (this.stateOpts.filters && this.filtersData) {
            gridOpts.search = true;
            gridOpts.postData = {};
            gridOpts.postData["filters"] = JSON.stringify(this.filtersData);
        }
                
        return this;
    };

    // ---------------------
    // UPDATE FILTER TOOLBAR
    // ---------------------
    
    /**
     * Restores filter values in the toolbar search inputs - azg
     * Called AFTER grid is created
     */
    this.updateFilterToolbar = function(grid, gridOpts) {
        if (this.stateOpts.filters && this.filtersData) {
            var f = JSON.stringify(this.filtersData);
            var cm = gridOpts.colModel;
            var myDefaultSearch = 'cn';  // Default search operation: contains
            
            if (typeof(f) === "string") {
                var filters = jQuery.parseJSON(f);
                
                // Only process simple AND filters without grouping
                if (filters && filters.groupOp === "AND" && 
                    typeof(filters.groups) === "undefined") {
                    
                    rules = filters.rules;
                    
                    // Process each filter rule
                    for (i = 0, l = rules.length; i < l; i++) {
                        rule = rules[i];
                        
                        // Find column index for this rule
                        iCol = -1;
                        for (j = 0; j < cm.length; j++) {
                            if ((cm[j].index || cm[j].name) === rule.field) {
                                iCol = j;
                            }
                        }

                        if (iCol >= 0) {
                            cmi = cm[iCol];
                            // Get the toolbar search control for this column
                            control = jQuery("#gbox_"+grid[0].id+" #gs_" + jQuery.jgrid.jqID(cmi.name));
                            
                            // Check if control exists and operation matches
                            if (control.length > 0 &&
                                (((typeof(cmi.searchoptions) === "undefined" ||
                                typeof(cmi.searchoptions.sopt) === "undefined")) ||
                                (typeof(cmi.searchoptions) === "object" &&
                                jQuery.isArray(cmi.searchoptions.sopt) &&
                                cmi.searchoptions.sopt.length > 0 &&
                                cmi.searchoptions.sopt[0] === rule.op))) {
                                
                                tagName = control[0].tagName.toUpperCase();
                                
                                // Handle SELECT dropdowns
                                if (tagName === "SELECT") {
                                    // Multi-select: set multiple selected values - azg
                                    if (cmi.searchoptions.multiple) {
                                        var values = rule.data.split(',');
                                        for (var v in values) {
                                            control.find("option[value='" + values[v] + "']")
                                                .attr('selected', 'selected');
                                        }
                                    }
                                    // Single select
                                    else {
                                        control.find("option[value='" + 
                                            $.jgrid.jqID(rule.data) + "']")
                                            .attr('selected', 'selected');
                                    }
                                }
                                // Handle text INPUT fields
                                else if (tagName === "INPUT") {
                                    control.val(rule.data);
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    // ---------------------
    // UPDATE FILTERS (DIALOG)
    // ---------------------
    
    /**
     * Restores filter values in the advanced search dialog
     */
    this.updateFilters = function(filterDlg) {
        
        // Helper function to set filter row values
        function assignValues(fltRow, fltVals) {
            fltRow.find('select[name=field]').val(fltVals.field).change();
            fltRow.find('select[name=op]').val(fltVals.op).change();
            fltRow.find('.vdata').val(fltVals.data).change();
        }

        if (this.stateOpts.filters && this.filtersData) {
            // Set the group operator (AND/OR)
            jQuery(filterDlg).find('select[name=groupOp]')
                .val(this.filtersData.groupOp);
            
            var fltRow = jQuery(filterDlg).find('tr.sf:last');
            
            if (this.filtersData.rules.length > 0) {
                // Set first rule
                assignValues(fltRow, this.filtersData.rules[0]);

                // Add and set remaining rules
                var index = 1;
                while (index < this.filtersData.rules.length) {
                    jQuery(filterDlg).searchFilter().add();
                    fltRow = jQuery(filterDlg).find('tr.sf:last');
                    assignValues(fltRow, this.filtersData.rules[index]);
                    index++;
                }
            }
        }

        return this;
    };

    // ---------------------
    // UPDATE EXPANSION
    // ---------------------
    
    /**
     * Restores subgrid expanded/collapsed states
     */
    this.updateExpansion = function(grid) {
        var gridRowIds = grid.getDataIDs();
        
        for (var i = 0; i < gridRowIds.length; i++) {
            // Expand if in saved expanded list
            if (jQuery.inArray(gridRowIds[i], this.expRows) != -1)
                grid.expandSubGridRow(gridRowIds[i]);
            else
                grid.collapseSubGridRow(gridRowIds[i]);
        }
    };

    // ---------------------
    // EXPANSION HELPERS
    // ---------------------
    
    /**
     * Adds a row ID to the expanded rows list
     */
    this.addExpRow = function(rowId) {
        var indx = jQuery.inArray(rowId, this.expRows);
        if (indx == -1)
            this.expRows.push(rowId);
    };

    /**
     * Removes a row ID from the expanded rows list
     */
    this.delExpRow = function(rowId) {
        var indx = jQuery.inArray(rowId, this.expRows);
        if (indx != -1)
            this.expRows.splice(indx, 1);
    };

    // ---------------------
    // INITIALIZATION
    // ---------------------
    
    /**
     * Constructor initialization
     */
    this._init = function(options) {
        if (options) {
            this.refreshOptions(options);
        }
    };

    this._init(options);
}

// ====================================================================================
// JQGRID EXTENSIONS - Wraps jqGrid methods to add state management
// ====================================================================================

(function(jQuery) {
    if (jQuery.fn.jqGrid) {
        
        // ---------------------
        // OVERRIDE MAIN jqGrid METHOD
        // ---------------------
        
        jQuery.fn.extend({
            _baseJqGrid: jQuery.fn.jqGrid,  // Save original method
            
            jqGrid: function(opts) {
                
                // Handle method calls (e.g., $('#grid').jqGrid('getRowData'))
                if (typeof(opts) == "undefined")
                    opts = {};
                
                if (typeof(opts) !== "object") {
                    var func = jQuery.fn.jqGrid[opts];

                    if (!func) {
                        // Handle grouped methods like 'grouping.handler' - azg
                        var opts_ex = opts.split(".");
                        func = jQuery.fn.jqGrid[opts_ex[0]][opts_ex[1]];
                    }
                    
                    if (!func)
                        throw ("jqGrid - No such method: " + opts);

                    var args = jQuery.makeArray(arguments).slice(1);
                    return func.apply(this, args);
                }

                // ---------------------
                // INITIALIZE STATE
                // ---------------------
                
                var gState = null;
                if (opts.stateOptions) {
                    gState = new GridState(opts.stateOptions);
                    gState.load();                    // Load from storage
                    gState.updateGridOptions(opts);   // Apply to options
                }

                var gridSelector = this;
                var overrEvts = {};  // Store original event handlers
        
                // ---------------------
                // WRAP loadBeforeSend EVENT
                // ---------------------
                
                if (typeof(opts.loadBeforeSend) !== 'undefined')
                    overrEvts.loadBeforeSend = opts.loadBeforeSend;

                opts.loadBeforeSend = function(xmlHttpReq) {
                    var grid = jQuery(gridSelector);
                    var gState = grid.gridState();
                    
                    // Save state before loading data
                    if (gState) {
                        gState.refreshFilters(grid);
                        gState.refreshPagerData(grid);
                        gState.refreshOrderData(grid);
                        gState.save();
                    }

                    // Call original handler
                    var evts = grid.data('overrEvents');
                    if (evts && evts.loadBeforeSend)
                        evts.loadBeforeSend.call(this, xmlHttpReq);
                };

                // ---------------------
                // WRAP onSelectAll EVENT
                // ---------------------

                // revamped selection persistance using following link, removed old version
				// http://stackoverflow.com/questions/18502592/make-jqgrid-multiselect-selection-persist-following-pagination-toolbar-search/22014302#22014302
                
                if (typeof(opts.onSelectAll) !== 'undefined')
                    overrEvts.onSelectAll = opts.onSelectAll;

                opts.onSelectAll = function(rowIds, status) {
                    var grid = jQuery(gridSelector);
                    var gState = grid.gridState();
                    
                    if (gState) {
                        // Add/remove all rows from selection state
                        if (status === true) {
                            for (var i = 0; i < rowIds.length; i++) {
                                gState.selRows[rowIds[i]] = true;
                            }
                        } 
                        else {
                            for (var i = 0; i < rowIds.length; i++) {
                                delete gState.selRows[rowIds[i]];
                            }
                        }

                        gState.save();
                    }

                    // Call original handler
                    var evts = grid.data('overrEvents');
                    if (evts && evts.onSelectAll)
                        evts.onSelectAll.call(this);
                };
                
                // ---------------------
                // WRAP onSelectRow EVENT
                // ---------------------
                
                if (typeof(opts.onSelectRow) !== 'undefined')
                    overrEvts.onSelectRow = opts.onSelectRow;

                opts.onSelectRow = function(rowId, status, e) {
                    var grid = jQuery(gridSelector);
                    var gState = grid.gridState();
                    
                    if (gState) {
                        // Update selection state for this row
                        if (status === false) {
                            delete gState.selRows[rowId];
                        } else {
                            gState.selRows[rowId] = status;
                        }
                        gState.save();
                    }

                    // Call original handler
                    var evts = grid.data('overrEvents');
                    if (evts && evts.onSelectRow)
                        evts.onSelectRow.call(this, rowId);
                };

                // ---------------------
                // WRAP gridComplete EVENT
                // ---------------------
                
                if (typeof(opts.gridComplete) !== 'undefined')
                    overrEvts.gridComplete = opts.gridComplete;

                opts.gridComplete = function() {
                    var grid = jQuery(gridSelector);
                    var gState = grid.gridState();
                    
                    if (gState) {
                        // Restore row selections
                        var selrows = grid.jqGrid('getGridParam', 'selarrrow');
                        for (var rowId in gState.selRows) {
                            if (gState.selRows[rowId] == true) {
                                // Don't re-select if already selected (virtual scroll fix) - azg
                                if (selrows.indexOf(rowId) == -1)
                                    grid.setSelection(rowId, true);
                            }
                        }
                        
                        // Restore subgrid expansion states
                        gState.updateExpansion(grid);
                        
                        // Restore toolbar filter values
                        gState.updateFilterToolbar(jQuery(this), opts);

                        // reselect multiselect filter on refresh, if any
                        jQuery('#gbox_'+grid[0].id+' button.ui-multiselect[id^=gs_]').each(function(){
                            jQuery('#'+jQuery(this).attr('id').replace('_ms','')).multiselect('refresh',true);
                        });
                    }
                    
                    // Call original handler
                    var evts = grid.data('overrEvents');
                    if (evts && evts.gridComplete)
                        evts.gridComplete.call(this);
                };

                // ---------------------
                // WRAP subGridRowExpanded EVENT
                // ---------------------
                
                if (typeof(opts.subGridRowExpanded) !== 'undefined')
                    overrEvts.subGridRowExpanded = opts.subGridRowExpanded;

                opts.subGridRowExpanded = function(pID, id) {
                    var grid = jQuery(gridSelector);
                    var gState = grid.gridState();
                    
                    if (gState) {
                        gState.addExpRow(id);
                        gState.save();
                    }

                    // Call original handler
                    var evts = grid.data('overrEvents');
                    if (evts && evts.subGridRowExpanded)
                        evts.subGridRowExpanded.call(this, pID, id);
                };

                // ---------------------
                // WRAP subGridRowColapsed EVENT
                // ---------------------
                
                if (typeof(opts.subGridRowColapsed) !== 'undefined')
                    overrEvts.subGridRowColapsed = opts.subGridRowColapsed;

                opts.subGridRowColapsed = function(pID, id) {
                    var grid = jQuery(gridSelector);
                    var gState = grid.gridState();
                    
                    if (gState) {
                        gState.delExpRow(id);
                        gState.save();
                    }

                    // Call original handler
                    var evts = grid.data('overrEvents');
                    if (evts && evts.subGridRowColapsed)
                        evts.subGridRowColapsed.call(this, pID, id);
                };

                // Store wrapped events
                jQuery(this).data('overrEvents', overrEvts);

                // Attach state object to grid
                if (gState)
                    jQuery(this).gridState(gState);

                // ---------------------
                // CALL ORIGINAL jqGrid
                // ---------------------
                
                var result = this._baseJqGrid.call(this, opts);
                
                // ---------------------
                // WRAP dragEnd (column resize)
                // ---------------------
                
                if (result.length && result[0].grid && result[0].grid.dragEnd) {
                    jQuery.extend(result[0].grid, {
                        _baseDragEnd: result[0].grid.dragEnd,
                        dragEnd: function() {
                            this._baseDragEnd.call(this);
                            var gState = result.gridState();
                            
                            // Save column widths after resize
                            if (gState) {
                                gState.refreshColumns(result);
                                gState.save();
                            }
                        }
                    });

                    jQuery.extend(result[0].grid.dragEnd, 
                                  result[0].grid._baseDragEnd);
                }
                else {
                    // Cleanup if grid creation failed
                    jQuery(this).removeData('overrEvents');
                    jQuery(this).gridState(null);
                }

                return result;
            }
        });

        // Copy all original jqGrid methods to wrapped version
        jQuery.extend(jQuery.fn.jqGrid, jQuery.fn._baseJqGrid);

        // ---------------------
        // WRAP showHideCol METHOD
        // ---------------------
        
        if (jQuery.fn.showHideCol) {
            jQuery.jgrid.extend({
                _baseShowHideCol: jQuery.fn.showHideCol,
                
                showHideCol: function(colname, show) {
                    // Fix: readjust width after column visibility change
                    var oldWidth = this.jqGrid("getGridParam", "width");

                    var result = this._baseShowHideCol.call(this, colname, show);
                    var gState = this.gridState();
                    
                    // Save new column state
                    if (gState) {
                        gState.refreshColumns(this);
                        gState.save();
                    }

                    this.jqGrid("setGridWidth", oldWidth);
                    
                    return result;
                }
            });

            jQuery.extend(jQuery.fn.showHideCol, jQuery.fn._baseShowHideCol);
        }

        // ---------------------
        // WRAP setGridParam METHOD
        // ---------------------
        
        if (jQuery.fn.setGridParam) {
            jQuery.jgrid.extend({
                _baseSetGridParam: jQuery.fn.setGridParam,
                
                setGridParam: function(newParams) {
                    var grid = jQuery(this);
                    var overrEvts = grid.data('overrEvents');

                    // Store new event handlers, don't pass to base method
                    if (typeof(newParams.loadBeforeSend) !== 'undefined') {
                        overrEvts.loadBeforeSend = newParams.loadBeforeSend;
                        newParams.loadBeforeSend = undefined;
                    }

                    if (typeof(newParams.gridComplete) !== 'undefined') {
                        overrEvts.gridComplete = newParams.gridComplete;
                        newParams.gridComplete = undefined;
                    }

                    if (typeof(newParams.onSelectRow) !== 'undefined') {
                        overrEvts.onSelectRow = newParams.onSelectRow;
                        newParams.onSelectRow = undefined;
                    }

                    if (typeof(newParams.subGridRowExpanded) !== 'undefined') {
                        overrEvts.subGridRowExpanded = newParams.subGridRowExpanded;
                        newParams.subGridRowExpanded = undefined;
                    }

                    if (typeof(newParams.subGridRowColapsed) !== 'undefined') {
                        overrEvts.subGridRowColapsed = newParams.subGridRowColapsed;
                        newParams.subGridRowColapsed = undefined;
                    }

                    var result = grid._baseSetGridParam.call(this, newParams);
                    grid.data('overrEvents', overrEvts);

                    // Handle state options change
                    if (typeof(newParams.stateOptions) !== 'undefined') {
                        if (newParams.stateOptions) {
                            var gState = grid.gridState();
                            if (!gState) {
                                gState = new GridState(newParams.stateOptions);
                                gState.load();
                            }
                            else
                                gState.refreshOptions(newParams.stateOptions);

                            gState.apply(grid);
                        }
                        else
                            grid.gridState(null);
                    }

                    return result;
                }
            });

            jQuery.extend(jQuery.fn.setGridParam, jQuery.fn._baseSetGridParam);
        }

        // ---------------------
        // WRAP getGridParam METHOD
        // ---------------------
        
        if (jQuery.fn.getGridParam) {
            jQuery.jgrid.extend({
                _baseGetGridParam: jQuery.fn.getGridParam,
                
                getGridParam: function(pName) {
                    var overrEvts = jQuery(this).data('overrEvents') || {};
                    
                    // Return wrapped event handlers instead of base ones
                    switch (pName) {
                        case 'beforeRequest':
                            return overrEvts.beforeRequest;
                        case 'gridComplete':
                            return overrEvts.gridComplete;
                        case 'onSelectRow':
                            return overrEvts.onSelectRow;
                        case 'subGridRowExpanded':
                            return overrEvts.subGridRowExpanded;
                        case 'subGridRowColapsed':
                            return overrEvts.subGridRowColapsed;
                        default:
                            return this._baseGetGridParam.call(this, pName);
                    }
                }
            });

            jQuery.extend(jQuery.fn.getGridParam, jQuery.fn._baseGetGridParam);
        }

        // ---------------------
        // WRAP remapColumns METHOD
        // ---------------------
        
        if (jQuery.fn.remapColumns) {
            jQuery.jgrid.extend({
                _baseRemapColumns: jQuery.fn.remapColumns,
                
                remapColumns: function(permutation, updateCells, keepHeader) {
                    // Call original remapColumns
                    this._baseRemapColumns.call(this, permutation, updateCells, keepHeader);
                    
                    var gState = this.gridState();
                    // Save new column order
                    if (gState) {
                        gState.refreshColumns(this);
                        gState.save();
                    }
                }
            });

            jQuery.extend(jQuery.fn.remapColumns, jQuery.fn._baseRemapColumns);
        }

        // ---------------------
        // WRAP searchGrid METHOD
        // ---------------------
        
        if (jQuery.fn.searchGrid) {
            jQuery.jgrid.extend({
                _baseSearchGrid: jQuery.fn.searchGrid,
                
                searchGrid: function(opts) {
                    // Store/retrieve search options
                    var options = this.data('searchOptions');
                    if (!options)
                        options = {};
                        
                    // If string parameter, return stored option
                    if (typeof(opts) === 'string')
                        return options[opts];

                    // Merge and store new options
                    this.data('searchOptions', jQuery.extend(options, opts));
                    
                    var result = this._baseSearchGrid.call(this, opts);
                    var gState = this.gridState();
                    
                    // Restore saved filters to the search dialog
                    if (gState) {
                        var filterDlg = jQuery('#fbox_' + this.attr('id'));
                        gState.updateFilters(filterDlg);
                    }

                    return result;
                }
            });

            jQuery.extend(jQuery.fn.searchGrid, jQuery.fn._baseSearchGrid);
        }

        // ---------------------
        // NEW gridState METHOD
        // ---------------------
        
        /**
         * Gets or sets the GridState object for a grid
         * Usage:
         *   $('#grid').gridState()           // Get state object
         *   $('#grid').gridState(stateObj)   // Set state object
         *   $('#grid').gridState(null)       // Remove state object
         */
        jQuery.jgrid.extend({
            gridState: function(gState) {
                // Remove state
                if (gState === null) {
                    var curState = this.data('gridState');
                    if (curState)
                        curState.remove();

                    this.removeData('gridState');
                    return this;
                }

                // Set state
                if (typeof(gState) === 'object') {
                    this.data('gridState', gState);
                    return this;
                }

                // Get state
                return this.data('gridState');
            }
        });
    }
})(jQuery);

// ====================================================================================
// USAGE EXAMPLE
// ====================================================================================

/*

// Simple usage - enable all features with a storage key:
$("#myGrid").jqGrid({
    stateOptions: "myGridState",
    // ... other grid options
});

// Advanced usage - enable specific features:
$("#myGrid").jqGrid({
    stateOptions: {
        storageKey: "myGridState",
        columns: true,      // Save column width/visibility/order
        filters: true,      // Save search filters
        selection: true,    // Save selected rows
        expansion: false,   // Don't save subgrid expansion
        pager: true,        // Save pagination
        order: true         // Save sort order
    },
    // ... other grid options
});

// Manually save state:
var state = $("#myGrid").gridState();
state.save();

// Manually load state:
var state = new GridState("myGridState");
state.load();

// Clear saved state:
$("#myGrid").gridState().remove();

// Access state data:
var state = $("#myGrid").gridState();
console.log(state.colsData);      // Column configuration
console.log(state.filtersData);   // Filter rules
console.log(state.selRows);       // Selected row IDs
console.log(state.expRows);       // Expanded subgrid row IDs
console.log(state.pagerData);     // Page number and rows per page
console.log(state.orderData);     // Sort column and direction

// ==============
// Code Structure
// ==============

// Utility Functions - Helper functions like swap() for array manipulation
// GridState Constructor - The main class with methods for:

// Saving/Loading: save(), load(), remove()
// Refreshing State: Methods to capture current grid settings
// Applying State: Methods to restore saved settings to the grid
// Managing Selections/Expansions: Track which rows are selected/expanded

// jqGrid Extensions - Wraps core jqGrid methods to add automatic state persistence:

// Main jqGrid method: Initializes state management
// Event handlers: Wraps events like onSelectRow, gridComplete, loadBeforeSend
// Helper methods: Wraps showHideCol, remapColumns, searchGrid, etc.

// New gridState() method: Provides API to get/set/remove state objects

// Key Concepts:

// Automatic tracking: Events are intercepted to automatically save state changes
// Lazy persistence: State is saved to localStorage after each significant change
// Restore on load: When grid initializes, saved state is applied before rendering
// Original handlers preserved: User's event handlers still execute after state logic

// The plugin essentially acts as middleware, capturing grid interactions and persisting them transparently.

*/
