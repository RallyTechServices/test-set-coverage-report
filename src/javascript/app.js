Ext.define("CArABU.app.TSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new CArABU.technicalservices.Logger(),

    items: [
        { xtype:'container',itemId:'selector_box', layout:{type:'hbox'}}, //top, right, bottom, left
        {xtype:'container',itemId:'top_box',layout:{type:'vbox'},items: [
            {xtype:'container',itemId:'totals_f_box', layout:{type:'hbox'}, margin: 5},
            {xtype:'container',itemId:'totals_box',layout:{type:'hbox'}, margin: 5}
            ]},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "CArABU.app.TSApp"
    },

    modelNames : ['TestSet'],
    launch: function() {
        var me = this;
        this.logger.setSaveForLater(this.getSetting('saveLog'));

        me._addSelector();
        setTimeout(function(){ me.updateView(); }, 500);
        
    },

    _addSelector: function(){
        var me = this;
       
        me.down('#selector_box').add([
            {
                xtype: 'rallyreleasecombobox',
                name: 'releaseCombo',
                itemId: 'releaseCombo',
                stateful: true,
                stateId: 'releaseCombo-feature-test-case',   
                fieldLabel: 'Select Release:',
                multiSelect: true,
                margin: '10 10 10 10', 
                width: 450,
                labelWidth: 100,
                cls: 'rally-checkbox-combobox',
                valueField:'Name',
                showArrows: false,
                displayField: 'Name'
                ,
                listConfig: {
                    cls: 'rally-checkbox-boundlist',
                    itemTpl: Ext.create('Ext.XTemplate',
                        '<div class="rally-checkbox-image"></div>',
                        '{[this.getDisplay(values)]}</div>',
                        {
                            getDisplay: function(values){
                                return values.Name;
                            }
                        }
                    )
                }
            },
            {
                xtype:'rallybutton',
                name: 'updateButton',
                itemId: 'updateButton',
                margin: '10 10 10 10',
                text: 'Update',
                listeners: {
                    click: me.updateView,
                    scope: me
                }
            }
        ]);
    },

    updateView: function(){
        var me = this;


        if(!me.down('#releaseCombo')) return;
       // console.log('releases >',me.down('#releaseCombo').value);

        var cb = me.down('#releaseCombo');
        //console.log(cb);
        if(cb.valueModels.length == 0){
            Rally.ui.notify.Notifier.showError({ message: "Please select one or more releases to display the report" });
            return;
        }
        
        var ts_object_ids = [];


        me.setLoading(true);
        me._getSelectedPIs(me.modelNames[0]).then({
            success: function(records){
                // console.log('_getSelectedPIs>>',records);
                if(records.length == 0){
                    me.showErrorNotification('No Data found!');
                }
                var promises = [];


                Ext.Array.each(records,function(r){
                    ts_object_ids.push(r.get('ObjectID'));
                    promises.push(me._getTestCaseCollection(r));
                });



                Deft.Promise.all(promises).then({
                    success: function(records){
                        console.log('collections',records);
                        records = Ext.Array.flatten(records);
                        me.lastVerdict = {}
                        me.lb_tc_results = [];
                        Ext.Array.each(records,function(tc){
                            me.lb_tc_results.push({
                                                    'ObjectID': tc.TestCase.get('ObjectID'),
                                                    'FormattedID': tc.TestCase.get('FormattedID'),
                                                    'Method': tc.TestCase.get('Method'),
                                                    '_ItemHierarchy': [tc.TestSet.get('ObjectID'),tc.TestCase.get('ObjectID')]});
                            me.lastVerdict[tc.TestCase.get('ObjectID')] = tc.TestCase.get('LastVerdict');
                        });

                        console.log('after construct',me.lastVerdict,  me.lb_tc_results);
                        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
                            models: me.modelNames,
                            enableHierarchy: true
                        }).then({
                            success: me._addGrid,
                            scope: me
                        });                        
                    },
                    scope: me
                });


                // me._getTCs(ts_object_ids).then({
                //     success: function(records){
                //         console.log('_getTCs>>',records);
                //         // me.totalTaskTimeSpent = 0;
                //         me.lastVerdict = {}
                //         me.lb_tc_results = [];
                //         Ext.Array.each(records,function(tc){
                //             //me.lb_tc_results.push({'_ItemHierarchy': [tc.get('TestSet').ObjectID,]})
                //             me.lastVerdict[tc.get('ObjectID')] = tc.get('LastVerdict');
                //         });

                //         Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
                //             models: me.modelNames,
                //             enableHierarchy: true
                //         }).then({
                //             success: me._addGrid,
                //             scope: me
                //         });

                //     },
                //     scope: me
                // });


            },
            scope: me         
        }).always(function(){
            me.setLoading(false);
        });


    },


    _getTestCaseCollection: function(ts){
        var deferred = Ext.create('Deft.Deferred');

            ts.getCollection('TestCases').load({
                fetch: ['FormattedID', 'Name', 'LastVerdict','ObjectID','Method'],
                callback: function(records, operation, success) {
                    var results = [];
                    Ext.Array.each(records, function(tc) {
                        results.push({"TestSet":ts,"TestCase":tc});
                    });
                    deferred.resolve(results);                    
                }
            });
        return deferred.promise;
    },

    _getSelectedPIs: function(selectedPI,filters){
        var me = this;
        var config = {
                        model : selectedPI,
                        fetch : ['ObjectID','FormattedID','TestCases'],
                        limit:'Infinity'
                    }
        if(filters){
            config['filters'] = filters;
        }
        return me._loadWsapiRecords(config);
    },

    _getTCs: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        Ext.create('CArABU.technicalservices.chunk.Store',{
            storeConfig: {
                model: 'TestCase',
                fetch: ['ObjectID','LastVerdict','TestSet','TestSets'],
            },
            chunkProperty: 'TestSets.ObjectID',
            chunkValue: filters
        }).load().then({
            success: function(records){
                deferred.resolve(records);
            },
            failure: me.showErrorNotification,
            scope: me
        });

        return deferred.promise;
    },

    _addGrid: function (store) {

        var me = this;
        var context = me.getContext();
        store.on('load', me._updateAssociatedData, me);
        var r_filters = [];
        Ext.Array.each(me.down('#releaseCombo').value, function(rel){
            r_filters.push({
                property: 'Release.Name',
                value: rel
            })
        });

        r_filters = Rally.data.wsapi.Filter.or(r_filters)

        console.log('Filter>>', r_filters && r_filters.toString());
        me.down('#display_box').removeAll();
        me.down('#display_box').add({
                  itemId: 'pigridboard',
                  xtype: 'rallygridboard',
                  context: context,
                  modelNames: me.modelNames,
                  // autoScroll: true,
                  toggleState: 'grid',
                  // layout:'fit',
                  //padding: 5,
                  border: 1,
                  style: {
                      borderColor: 'lightblue',
                      borderStyle: 'solid'
                  },
                  plugins: me._getPlugins(),
                  gridConfig: {
                    store: store,
                    enableEditing: false,
                    storeConfig:{
                        filters: r_filters
                    },
                    stateful: true,
                    stateId: context.getScopedStateId('gridboard_state'),                                         
                    columnCfgs: me._getColumnCfgs(),
                    derivedColumnCfgs: me.getDerivedColumns(),
                    shouldShowRowActionsColumn:false,
                    enableRanking: false,
                    enableBulkEdit: false,
                    sortableColumns: true,
                    // autoScroll: true,
                    // scroll : 'both',
                    viewConfig: {
                        xtype: 'rallytreeview',
                        enableTextSelection: false,
                        animate: false,
                        loadMask: false,

                        listeners: {
                            cellclick: me.showDrillDown,
                            scope: me
                        }
                    }     
                  },
                  listeners: {
                    load: me._addTotals,
                    viewChange: me.updateView,
                    scope: me
                  }
                  ,         
                  height: 500
                  ,
                  width:1200
              });

        me.setLoading(false);
    },


   _addTotals:function(grid) {
        var me = this;
        // var filters = me.down('#pigridboard') && me.down('#pigridboard').gridConfig.store.filters.items[0];
        var filters = grid && grid.gridConfig.store.filters.items;
        var allPi;
        me.setLoading('Loading totals...');
            me._getSelectedPIs(me.modelNames[0],filters).then({
                success: function(records){


                    var totalPass = {value:0,records:[]},
                        totalFail = {value:0,records:[]},
                        totalNoRun = {value:0,records:[]},
                        totalOther = {value:0,records:[]},
                        grandTotal = {value:0,records:[]},
                        totalAutomated = 0,
                        pctAutomated = 0,
                        feature_totals = {};
                    var record = {};
                    Ext.Array.each(records,function(r){
                        feature_totals[r.get('FormattedID')] = {
                            grandTotal:0,
                            totalPass:0,
                            totalFail:0,
                            totalNoRun:0,
                            totalOther:0,
                            totalAutomated:0                                     
                        }
                        Ext.Array.each(me.lb_tc_results,function(lbTc){
                            if(Ext.Array.contains(lbTc._ItemHierarchy,r.get('ObjectID'))){
                                record = {
                                    'ObjectID': lbTc.ObjectID,
                                    'FormattedID': lbTc.FormattedID,
                                    'Name': lbTc.Name,
                                    'Method': lbTc.Method
                                }
                                grandTotal.value++;
                                grandTotal.records.push(record);                                
                                if(feature_totals[r.get('FormattedID')]){
                                    feature_totals[r.get('FormattedID')].grandTotal++
                                }else{
                                    feature_totals[r.get('FormattedID')] = {
                                        grandTotal:1,
                                        totalPass:0,
                                        totalFail:0,
                                        totalNoRun:0,
                                        totalOther:0,
                                        totalAutomated:0                                       
                                    }
                                }
                                if(lbTc.Method == "Automated"){
                                    totalAutomated++;
                                    feature_totals[r.get('FormattedID')].totalAutomated++;
                                }                    
                                if(me.lastVerdict[lbTc.ObjectID] == "Pass"){
                                    totalPass.value++;
                                    totalPass.records.push(record);
                                    feature_totals[r.get('FormattedID')].totalPass++;
                                }else if(me.lastVerdict[lbTc.ObjectID] == "Fail"){
                                    totalFail.value++;
                                    totalFail.records.push(record);                                    
                                    feature_totals[r.get('FormattedID')].totalFail++
                                }else if(me.lastVerdict[lbTc.ObjectID] == null || me.lastVerdict[lbTc.ObjectID] == ""){
                                    totalNoRun.value++;
                                    totalNoRun.records.push(record);                                        
                                    feature_totals[r.get('FormattedID')].totalNoRun++;
                                }else{
                                    totalOther.value++;
                                    totalOther.records.push(record);                                       
                                    feature_totals[r.get('FormattedID')].totalOther++;
                                }
                            }
                        });
                    });

                    if(grandTotal.value > 0){
                        pctAutomated = Ext.Number.toFixed((totalAutomated / grandTotal.value) * 100,2);
                    }

                    console.log('feature_totals>>',feature_totals);

                    var featurePassing = 0,
                        featureFailing = 0,
                        featureNoRun = 0,
                        featureNotCovered = 0;
                    me.passingFeatureFilters = [];

                    _.each(feature_totals, function(value, key){
                        //console.log('Key, Value', key,value);
                        if(value.grandTotal === value.totalPass && value.grandTotal > 0) {
                            featurePassing++;
                            me.passingFeatureFilters.push({property:'FormattedID',operator: '!=',value:key});
                        }
                        if(value.totalFail > 0) featureFailing++;
                        //The Feature has  test cases, and at least one test has not run and zero test cases have failed.
                        // When a feature has at least one count in the 'Other' category (inconclusive or blocked) and no failures it is considered Incomplete.
                        if(value.grandTotal > 0 && value.totalFail === 0  && (value.totalNoRun > 0 || value.totalOther > 0)) featureNoRun++;
                        if(value.totalFail === 0 && value.totalPass === 0 && value.totalNoRun === 0 && value.totalOther === 0) featureNotCovered++;
                    });

                    console.log('passingFeatureFilters>>',me.passingFeatureFilters);

                    me.down('#totals_f_box').removeAll();
                    me.down('#totals_box').removeAll();
                    //me.down('#filter_box').removeAll();

                    Ext.create('Ext.data.Store', {
                        storeId:'totalStore',
                        fields:['GrandTotal','PctAutomated','TotalPass','TotalFail','TotalNoRun', 'TotalOther'],
                        data:{'items':[
                            { 'GrandTotal': grandTotal, 'PctAutomated': pctAutomated,'TotalPass': totalPass, 'TotalFail': totalFail, 'TotalNoRun': totalNoRun, 'TotalOther': totalOther},
                        ]},
                        proxy: {
                            type: 'memory',
                            reader: {
                                type: 'json',
                                root: 'items'
                            }
                        }
                    });

                    me.down('#totals_box').add({
                        xtype: 'grid',
                        title: 'Test Case Coverage',
                        header:{
                            style: {
                                background: 'lightBlue',
                                'color': 'white',
                                'font-weight': 'bold'
                            }
                        },
                        sortableColumns:false,
                        enableColumnHide:false,
                        store: Ext.data.StoreManager.lookup('totalStore'),
                        columns: [
                            { text: 'Total',  dataIndex: 'GrandTotal',flex:1,
                                renderer: function(GrandTotal){
                                    return GrandTotal.value > 0 ? '<a href="#">' + GrandTotal.value + '</a>' : 0;
                                }
                            },
                            { text: '% Automated', dataIndex: 'PctAutomated', flex:1,
                                renderer: function(value){
                                    return value + ' %'
                                }
                            },
                            { text: 'Passing', dataIndex: 'TotalPass',flex:1,
                                renderer: function(TotalPass){
                                    return TotalPass.value > 0 ? '<a href="#">' + TotalPass.value + '</a>' : 0;
                                }
                            },
                            { text: 'Failing', dataIndex: 'TotalFail',flex:1,
                                renderer: function(TotalFail){
                                    return TotalFail.value > 0 ? '<a href="#">' + TotalFail.value + '</a>' : 0;
                                }
                            },
                            { text: 'No Run', dataIndex: 'TotalNoRun',flex:1,
                                renderer: function(TotalNoRun){
                                    return TotalNoRun.value > 0 ? '<a href="#">' + TotalNoRun.value + '</a>' : 0;
                                }
                            },
                            { text: 'Other', dataIndex: 'TotalOther',flex:1,
                                renderer: function(TotalOther){
                                    return TotalOther.value > 0 ? '<a href="#">' + TotalOther.value + '</a>' : 0;
                                }
                            }
                        ],
                        width:600,
                        viewConfig: {
                            listeners: {
                                cellclick: this.showDrillDown,
                                scope: me
                            }
                        }     
                    });


                    Ext.create('Ext.data.Store', {
                        storeId:'totalFeatureStore',
                        fields:['GrandTotal', 'FeaturePassing','FeatureFailing','FeatureNoRun', 'FeatureNotCovered'],
                        data:{'items':[
                            { 'GrandTotal': records.length, 'FeaturePassing': featurePassing, 'FeatureFailing': featureFailing, 'FeatureNoRun': featureNoRun, 'FeatureNotCovered': featureNotCovered},
                        ]},
                        proxy: {
                            type: 'memory',
                            reader: {
                                type: 'json',
                                root: 'items'
                            }
                        }
                    });

                    me.down('#totals_f_box').add({
                        xtype: 'grid',
                        title: 'Test Set Coverage',
                        header:{
                            style: {
                                background: 'lightBlue',
                                'color': 'white',
                                'font-weight': 'bold'
                            }
                        },
                        sortableColumns:false,
                        enableColumnHide:false,
                        store: Ext.data.StoreManager.lookup('totalFeatureStore'),
                        columns: [
                            { text: 'Total Test Sets',  dataIndex: 'GrandTotal',flex:1},
                            { text: 'Passing Test Sets', dataIndex: 'FeaturePassing',flex:1},
                            { text: 'Failing Test Sets', dataIndex: 'FeatureFailing',flex:1},
                            { text: 'Incomplete <br>Test Sets', dataIndex: 'FeatureNoRun',flex:1},
                            { text: 'Not Covered <br>Test Sets', dataIndex: 'FeatureNotCovered',flex:1}
                        ],
                        width:500
                    });

                    me.down('#totals_f_box').add({
                        margin: 5,
                        xtype:'rallybutton',
                        text: 'Hide Passing <br>Test Sets',
                        listeners: {
                            click: function(btn){
                                me._hidePassingFeatures();
                            }
                        },
                        scope:me
                    })

                    me.setLoading(false);
                },
                scope:me
            });

 
    },

    _hidePassingFeatures: function(){
        var me = this;
        var filter = Rally.data.wsapi.Filter.and(me.passingFeatureFilters);
                   
        console.log(me.down('#pigridboard'),me.passingFeatureFilters);
        var grid = me.down('#pigridboard')
        var filters = grid && grid.gridConfig.store.filters.items;
        filters.push(filter);
            grid.applyCustomFilter(Ext.apply({
                recordMetrics: true,
                types: me.modelNames,
                filters: _.compact(filters)                
            }));
    },

    _updateAssociatedData: function(store, node, records, success){
        var me = this;
        me.suspendLayouts();
        me.setLoading(true);
        var record = {};
        Ext.Array.each(records,function(r){

            var totalPass = {value:0,records:[]},
                totalFail = {value:0,records:[]},
                totalNoRun = {value:0,records:[]},
                totalOther = {value:0,records:[]},
                totalStories = 0,
                totalCovered = 0;


            Ext.Array.each(me.lb_tc_results,function(lbTc){
                record = {
                    'ObjectID': lbTc.ObjectID,
                    'FormattedID': lbTc.FormattedID,
                    'Name': lbTc.Name,
                    'Method': lbTc.Method
                }
                if(Ext.Array.contains(lbTc._ItemHierarchy),r.get('ObjectID')){
                    if(me.lastVerdict[lbTc.ObjectID] == "Pass"){
                        totalPass.records.push(record);
                        totalPass.value++;
                    }else if(me.lastVerdict[lbTc.ObjectID] == "Fail"){
                        totalFail.records.push(record);
                        totalFail.value++;
                    }else if(me.lastVerdict[lbTc.ObjectID] == null || me.lastVerdict[lbTc.ObjectID] == ""){
                        totalNoRun.records.push(record);
                        totalNoRun.value++;
                    }else{
                        totalOther.records.push(record);
                        totalOther.value++;                        
                    }
                }
            });

            if(r.get('_type') == 'testset'){
                r.set('Passing', totalPass);
                r.set('Failing', totalFail);
                r.set('NoRun', totalNoRun);
                r.set('Other', totalOther);                
            }

            // r.set('TotalStories', totalStories);
            // r.set('TotalCovered', totalCovered);
        });
        me.setLoading(false);
        me.resumeLayouts();
    },

    _getPlugins: function(){
        var me = this;

        var model_names = ['TestSet','TestCase']

        var plugins = [
            {
                ptype: 'rallygridboardinlinefiltercontrol',
                inlineFilterButtonConfig: {
                    stateful: true,
                    stateId: me.getContext().getScopedStateId('filters'),
                    modelNames: model_names,
                    inlineFilterPanelConfig: {
                        collapsed: false,
                        quickFilterPanelConfig: {
                            defaultFields: ['ArtifactSearch', 'Owner'],
                            addQuickFilterConfig: {
                                whiteListFields: ['Milestones', 'Tags']
                            }
                        },
                        advancedFilterPanelConfig: {
                            advancedFilterRowsConfig: {
                                propertyFieldConfig: {
                                    whiteListFields: ['Milestones', 'Tags']
                                }
                            }
                        }  
                    }                  
            },
        }
        ];

        plugins.push({
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: model_names,
            stateful: true,
            gridAlwaysSelectedValues: ['Name'],
            stateId: me.getContext().getScopedStateId('field-picker')
        });

        plugins.push({
                    ptype: 'rallygridboardsharedviewcontrol',
                    stateful: true,
                    stateId: me.getContext().getScopedStateId('feature-view'),
                    stateEvents: ['select','beforedestroy'],
                    margin: 5
                });

        // plugins.push({
        //     ptype: 'rallygridboardsharedviewcontrol',
        //     sharedViewConfig: {
        //         stateful: true,
        //         stateId: me.getContext().getScopedStateId('feature-test-case-shared-view'),
        //         defaultViews: _.map(this._getDefaultViews(), function(view) {
        //             Ext.apply(view, {
        //                 Value: Ext.JSON.encode(view.Value, true)
        //             });
        //             return view;
        //         }, this),
        //         enableUrlSharing: this.isFullPageApp !== false
        //     }
        // });

        return plugins;        
    },

    // _getDefaultViews: function() {
    //     return [
    //         {
    //             Name: 'Default View',
    //             identifier: 1,
    //             Value: {
    //                 toggleState: 'grid',
    //                 fields: this._getColumnCfgs()
    //             }
    //         }
    //     ];
    // },

    _getColumnCfgs: function(){
        var me = this;

        return  [{
            dataIndex: 'Name',
            text: 'Name',
            flex: 1
        }].concat(me.getDerivedColumns());
    },


    getDerivedColumns: function(){
        var me = this;
        return [
        {
            tpl: '<div style="text-align:center;"></div>',
            text: 'Result Graph',
            xtype: 'templatecolumn',
            //flex:1,
            renderer: function(value, metaData, record){
                var values = {'lightgreen':record.get('Passing').value,'red':record.get('Failing').value,'yellow':record.get('NoRun').value,'blue':record.get('Other').value}

                if (values && Ext.isObject(values)){
                    var tpl = Ext.create('CArABU.technicalservices.ResultGraphTemplate');
                    return tpl.apply(values);
                }

                return '';
            }
        },
        {
            tpl: '<div style="text-align:center;">{Passing}</div>',
            text: 'Passing',
            //flex:1,
            xtype: 'templatecolumn',
            renderer: function(m,v,r){
                return me.renderLink(r,'Passing');
            }
        },{
            tpl: '<div style="text-align:center;">{Failing}</div>',
            text: 'Failing',
            //flex:1,
            xtype: 'templatecolumn',
            renderer: function(m,v,r){
                return me.renderLink(r,'Failing');
            }
        },{
            tpl: '<div style="text-align:center;">{NoRun}</div>',
            text: 'NoRun',
            //flex:1,
            xtype: 'templatecolumn',
            renderer: function(m,v,r){
                return me.renderLink(r,'NoRun');
            }
        },{
            tpl: '<div style="text-align:center;">{Other}</div>',
            text: 'Other',
            //flex:1,
            xtype: 'templatecolumn',
            renderer: function(m,v,r){
                return me.renderLink(r,'Other');
            }
        }
        // ,
        // {
        //     tpl: '<div style="text-align:center;"></div>',
        //     text: 'User Story Coverage',
        //     //flex:1,
        //     xtype: 'templatecolumn',
        //     renderer: function(value, metaData, record){
        //         var values = {'lightgreen':record.get('TotalCovered'),'lightgrey': (record.get('TotalStories') - record.get('TotalCovered'))}

        //         if (values && Ext.isObject(values)){
        //             var tpl = Ext.create('CArABU.technicalservices.ResultGraphTemplate');
        //             return tpl.apply(values);
        //         }

        //         return '';
        //     }
        // },
        // {
        //     tpl: '<div style="text-align:center;">{TotalCovered}</div>',
        //     text: 'User Stories Covered',
        //     //flex:1,
        //     xtype: 'templatecolumn'
        // },{
        //     tpl: '<div style="text-align:center;">{TotalStories}</div>',
        //     text: 'Total User Stories',
        //     //flex:1,
        //     xtype: 'templatecolumn'
        // }
        ];
    },    
 
    renderLink: function(r,index){
        return r.get(index).value > 0 ? '<div style="text-align:center;"><a href="#">' + r.get(index).value + '</a></div>' : '<div style="text-align:center;">--</a></div>';
    },

    showDrillDown: function(view, cell, cellIndex, record) {
        //console.log('view, cell, cellIndex, record',view, cell, cellIndex, record,view.panel.headerCt.getHeaderAtIndex(cellIndex).dataIndex);
        var me = this;
        var clickedDataIndex = view.panel.headerCt.getHeaderAtIndex(cellIndex).dataIndex || view.panel.headerCt.getHeaderAtIndex(cellIndex).text;
        var allowedIndices = ['Passing','Failing','NoRun','Other','Total','GrandTotal','TotalPass','TotalFail','TotalOther','TotalNoRun']
        if(!Ext.Array.contains(allowedIndices, clickedDataIndex)) return;

        var records = record.get(clickedDataIndex).records;
        // if(ruleValue.constructor != Array) return;

        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
            pageSize: 2000
        });
        
        var title = 'Records for ' + clickedDataIndex || ""

        
        Ext.create('Rally.ui.dialog.Dialog', {
            itemId    : 'detailPopup',
            title     : title,
            width     : Ext.getBody().getWidth()*0.4,
            height    : Ext.getBody().getHeight()*0.4,
            closable  : true,
            layout    : 'border',
            items     : [
                        {
                            xtype                : 'rallygrid',
                            itemId               : 'popupGrid',
                            region               : 'center',
                            layout               : 'fit',
                            sortableColumns      : true,
                            showRowActionsColumn : false,
                            showPagingToolbar    : false,
                            columnCfgs           : this.getDrillDownColumns(title),
                            store : store
                        }
                        ]
        }).show();
    },

    getDrillDownColumns: function(title) {
        var me = this;
        return [
            {
                dataIndex : 'FormattedID',
                text: "id",
                renderer: function(m,v,r){
                    var baseUrl = window.location.protocol + '//' + window.location.host + '/#/detail/testcase/' + r.get('ObjectID');
                    //console.log(baseUrl);
                    return '<a href="' + baseUrl +  '" target="_top" >' + r.get('FormattedID') + '</a>';
                }
            },
            {
                dataIndex : 'Name',
                text: "Name",
                flex: 1
            },
            {
                dataIndex : 'Method',
                text: "Method",
                flex: 1
            }
        ];
    },
    _loadWsapiRecords: function(config){
        console.log('_loadWsapiRecords',config);
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        // this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },

    getSettingsFields: function() {
        var check_box_margins = '5 0 5 0';
        return [{
            name: 'saveLog',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: check_box_margins,
            boxLabel: 'Save Logging<br/><span style="color:#999999;"><i>Save last 100 lines of log for debugging.</i></span>'

        }];
    },

    getOptions: function() {
        var options = [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];

        return options;
    },

    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }

        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{
            showLog: this.getSetting('saveLog'),
            logger: this.logger
        });
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },

    showErrorNotification: function(msg){
        this.logger.log('showErrorNotification', msg);
        Rally.ui.notify.Notifier.showError({
            message: msg
        });
    },    
});