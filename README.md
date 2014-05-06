jqGridState
===========

NOTE: This is Github migration of bitbucket's rpgkaiser repo & extended by gridphp.

This jqGrid plugin persist various settings of jqGrid on page refresh. 
It includes column chooser, search filters, row selection, subgrid expansion, pager & column order.

To enable, make set property to true when initializing object

To make it function, you must include these libs:

1) json2.js - //cdn.jsdelivr.net/json2/0.1/json2.min.js (JSON serializer)
2) jstorage.js - //cdn.jsdelivr.net/jstorage/0.1/jstorage.min.js (jStorage plugin)

Sample
------
	<script src="//cdn.jsdelivr.net/jstorage/0.1/jstorage.min.js" type="text/javascript"></script>	
	<script src="//cdn.jsdelivr.net/json2/0.1/json2.min.js" type="text/javascript"></script>	
	<script src="jqGrid.state.js" type="text/javascript"></script>	
	
	<script>
	var opts = {
		"stateOptions": {         
					storageKey: "gridStateCookie", // any storate name
					columns: true,
					filters: false,
					selection: true,
					expansion: false,					
					pager: false,
					order: true
					}
		};
		
		// ... represents existing grid options
		var grid = jQuery("#list").jqGrid( jQuery.extend( {...}, opts ) );
	</script>	
