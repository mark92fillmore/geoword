//TODO: will need to browserify this in the downloadable npm package?
//TODO:  clean code
//TODO:  am I polluting the global namespace??

$(document).ready(function() {

	var docs = null;		// the docs that are currently in the autofill table
	var mouse = null;		// the doc in the autofill table that is highlighted
	var waited = false;	// prevents hitting enter in the address bar and 
								// getting alerted that the doc does not exist

	// TODO: this came from the d3-map-ts file; these are only for testing 
	// insertion into the database;
	/*d3.select(window).on('dragover', handleDragOver)
   		.on('drop', handleFileSelect);

	// data to be read in
	function handleDragOver() {
		var event = d3.event;
		event.stopPropagation();
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	}

	// gets called on drop
	function handleFileSelect() {
		var event = d3.event;
		event.stopPropagation();
		event.preventDefault();
		var files = event.dataTransfer.files;
		for (var i = 0; i < files.length; i++) {
			var file = files[i];
			/*if (file.type !== 'text/csv') { 
				alert ("File " + file.name + " must be in csv format");
			}
			else {*
			var uFileName = file.name;
			var dataForm = new FormData();
			dataForm.append('file', file, uFileName);
			console.log("well, got this far");
			$.ajax({
				type: "POST",
				url: 'single',
				data: dataForm,
				contentType: false,
    			processData: false,
				success: function(data, textStatus, jqXHR) {
					console.log("(submitted to the database):");
					console.log(data);
				}, 
				//dataType: "json"
			});
		}
	}*/

/* ----------------------------------------------------------------- */
/* draw the map for the specified doc                                */
/* 	data: the filePath to be used for drawing the map              */
/* 	city: if this is a city, the doc containing the city info      */
/*    next:  the callback															*/
/* ----------------------------------------------------------------- */

	//TODO: why won't albersUsa center??
	function drawMap(data, city, next) {
		//console.log(data);
	   document.getElementById('input').reset();
	   document.getElementById('map').innerHTML='';
	   var name = data.slice(7);
	   console.log(name);
		var h = $("#map").height();
		var w = $("#map").width();
		var left = $('#map').offset().left;
		var right = left + w;
		var top = $('#map').offset().top;
		var bottom = top + h;
		var bl = [left, bottom];
		var tr = [right, top];
		var offset = [w/2, h/2];
		d3.json(name, function(err, newjson) {
			if (err) return next(err);
			var center = d3.geo.centroid(newjson);
			var bounds = d3.geo.bounds(newjson);
			
	      //console.log(offset);
	      /*if (isUS) {
	      	var projection = d3.geo.mercator();
	      	projection.center(center).translate(offset);
	      }
   		else {*/
   			var projection = d3.geo.equirectangular()
     								    .center(center)
     								    .translate(offset);
     		//}
     		var lb = projection.invert(bl);
     		var rt = projection.invert(tr);
     		var lat = Math.abs(bounds[0][0] - bounds[1][0]);
     		var lon = Math.abs(bounds[0][1] - bounds[1][1]);
     		var width = Math.abs(lb[0] - rt[0]);
     		var sWidth = (lat/width)*100;
			var height = Math.abs(lb[1] - rt[1]);
			var sHeight = (lon/height)*100;
			if (sWidth >= sHeight) {
				var forScale = width;
				var scale = sWidth;
			}
			else {
				var forScale = height;
				var scale = sHeight;
			}
			//TODO: still needs slight tweaking
			console.log((100/scale)*150)
			projection.scale((100/scale)*150);
			var path = d3.geo.path().projection(projection);
			var svg = d3.select("#map")
							.append("svg")
							.attr("width", w)
							.attr("height", h);
			svg.selectAll("path")
				.data(newjson.features)
				.enter()
				.append("path")
				.attr("d", path);
			if (city) {
				var features = [];
				var ob = {};
				ob.place = city.names[0];
				ob.lon = city.loc.coordinates[0]
				ob.lat = city.loc.coordinates[1];
				features.push(ob);
				svg.selectAll("circle")
					.data(features)
					.enter()
					.append("circle")
					.attr("cx", function(d) {
						return projection([ob.lon, ob.lat])[0];
					})
					.attr("cy", function(d) {
						return projection([ob.lon, ob.lat])[1];
					})
					.attr("r", 6.5)
					.style("fill", "red")
					.style("opacity", 0.75);
			};
			next(null, true);
		});
	};

/* ----------------------------------------------------------------- */
/*  get the id for the tr element that will get the mouseOver class  */
/* 	id:  the current id of the tr element with the mouseOver class */
/* 	direction:  +1 if down-arrow key was just pressed; -1 if up    */
/*    next:  the callback - err and the id to be returned as args    */	
/* ----------------------------------------------------------------- */

	//TODO:  fix these two similar functions???
	function getMouseOver(id, direction, next) {
		for (var i = 0; i < docs.length; i++) {
			if (docs[i]._id === id) {
				if (((i === 0) && (direction === -1)) 
					 || ((i === docs.length - 1) && (direction === 1))) {
					return next(null, null);
				}
				else {
					return next(null, docs[i + direction]._id);
				}
			}
		}	
		// if this error is thrown, then the document is no longer in memory
		// this is the fault of the code, not the user, and mark92fillmore
		// should be notified
		return next(404);
	}

//TODO:  fix this description
/* ----------------------------------------------------------------- */
/* draw the map for the specified doc                                */
/* 	data: the filePath to be used for drawing the map              */
/* 	city: if this is a city, the doc containing the city info      */
/*    next:  the callback															*/
/* ----------------------------------------------------------------- */

	function docFind(id) {
		var found = false;
		for (var i = 0; i < docs.length; i++) {
			if (docs[i]._id === id ) {
				found = true;
				if (docs[i].political === 'CITY') {
					var req = {};
					req.geo = docs[i].containers[0];
					console.log(req);
					console.log("searching for: " + req.geo);
					$.ajax({
						type: "POST",
						url: 'search',
						data: req,
						success: function(data, textStatus, jqXHR) {
							if (data.length !== 1) 
								console.log("TODO: need to fix this");
							drawMap(data[0].filePath, docs[i], 
								function(err, complete) {
									if (err) return next(err);
									if (complete) console.log("map complete");
									else console.log("map failed");
								});
						}
					});
				}
				else drawMap(docs[i].filePath, null, function(err, complete) {
					if (err) return next(err);
					if (complete) console.log("map complete");
					else console.log("map failed");
				});
				break;
			}
		}
		if (!found) console.log("Error: could not find specified file");
	}

	//TODO:  still need to implement arrow scrolling
	function drawTable(data) {
		mouse = null;
		var forDocs = [];
		var top = $('#geo').offset().top;
		var h = $('#geo').height();
		var bottom = top + h;
		var table = document.getElementById('tbl');
		table.top = bottom;
		var tb = document.getElementById('tb');
		var dataLength = data.length;
		var tableLength = 0;
		var oldTR = null;
		tb.innerHTML = "";
		for (var i = 0; i < dataLength; i++) {
			if (data[i].multi) continue;
			forDocs.push(data[i]);
			var newTR = document.createElement('tr');
			var newTD = document.createElement('td');
			var secTD = document.createElement('td');
			newTD.font = "Arial";
			newTD.innerHTML = data[i].names[0];
			newTD.position = "relative";
			newTD.width = "200px";
			secTD.width = "163px";
			newTR.id = data[i]._id;
			newTR.width = "363px";
			if (tableLength == 0) mouse = newTR;
			newTR.border = "dotted";
			newTR.onclick = function() { 
				var id = $(this).attr('id');
				docFind(id);
				$('#scroll').prop("hidden", true);
			};
			newTR.onmouseover = function() {
				$(mouse).removeClass('mouseOn');
				$(this).addClass('mouseOn');
				mouse = this;
			}
		 	newTR.appendChild(newTD);
		 	if (data[i].political) {
		 		if (data[i].containers && 
		 			(data[i].containers[0] !== "CONTINENT")) {
		 				var descriptor = data[i].political +
		 			  	   " in " + data[i].containers[0];
		 		}
		 		else var descriptor = data[i].political;
		 		secTD.innerHTML = descriptor;
		 		newTR.appendChild(secTD);
		  	}
		 	tb.appendChild(newTR);
		 	tableLength++;
		}
		if (tableLength !== 0) $('#scroll').prop("hidden", false);
		$(mouse).mouseover();
		docs = forDocs;
	}

	$(window).on('load', function(e) {
		$('#geo').focus();
	});

	//TODO: not sure why this prevented the key press from mattering, but it
	// did; check on that later
	$('#geo').keypress(function (e) {
		//TODO:  waited still has some bugs, too
		waited = true;
		if ((e.which && e.which == 13) || (e.keyCode && e.keyCode == 13)) {
        	e.preventDefault();
 			if (mouse) $(mouse).click();
 			else console.log("TODO:  add more code here");
      }
      else if ((e.which && e.which == 38) 
      			|| (e.keyCode && e.keyCode == 38)) {
      	e.preventDefault();
      	var oldID = $(mouse).attr('id');
      	getMouseOver(oldID, -1, function(err, newID) {
      		if (err) return next(err);
      		if (newID) {
      			var newMouse = $('#' + newID);
      			$('#' + newID).mouseover();

      		}
      	});
      }
      else if ((e.which && e.which == 40) 
      			|| (e.keyCode && e.keyCode == 40)) {
      	e.preventDefault();
      	var oldID = $(mouse).attr('id');
      	console.log("oldID: " + oldID);
      	getMouseOver(oldID, 1, function(err, newID) {
      		if (err) return next(err);
      		console.log(newID);
      		if (newID) {
      			console.log("simulating mouseover");
      			$('#' + newID).mouseover();
      		}
      	});
      }
   });

	$('#geo').keyup(function (e) {
		if ((e.which && e.which == 13) || (e.keyCode && e.keyCode == 13)) {
        	e.preventDefault();
        	if (mouse) $(mouse).click();
 			else if (waited) {
 				alert("This place is not in the database");
 				waited = false;
 			}
      }
      else if ((e.which && e.which == 38) 
      			|| (e.keyCode && e.keyCode == 38)) {
      	e.preventDefault();
      	var oldID = $(mouse).attr('id');
      	getMouseOver(oldID, -1, function(err, newID) {
      		if (err) return next(err);
      		if (newID) $('#' + newID).mouseover();
      	});
      }
      else if ((e.which && e.which == 40) 
      			|| (e.keyCode && e.keyCode == 40)) {
      	e.preventDefault();
      	var oldID = $(mouse).attr('id');
      	getMouseOver(oldID, 1, function(err, newID) {
      		if (err) return next(err);
      		if (newID) $('#' + newID).mouseover();
      	});
      }
      else if ((e.which && e.which == 37) 
      			|| (e.keyCode && e.keyCode == 37)) {
    	console.log("left arrow");
      }
      else if ((e.which && e.which == 39) 
      			|| (e.keyCode && e.keyCode == 39)) {
    	console.log("right arrow");
      }
      else { 
			console.log('a key was released!');
			$('#scroll').prop("hidden", true);
			setTimeout(function() {
				var term = $('#geo').val();
				if (term.length >= 2) {
					var req = {};
					req.geo = term;
					console.log(req);
					console.log("searching for: " + req.geo);
					$.ajax({
						type: "POST",
						url: 'search',
						data: req,
						success: function(data, textStatus, jqXHR) {
							console.log(data);
							drawTable(data);
						}
					});
				}
			}, 300);
		}
	});
		
	$('#read').on('submit', function(e) {
		e.preventDefault();
		console.log("waiting...");
		$(this).ajaxSubmit({
			success: function(data, status, xhr, $form){
				console.log("There should be 0 docs left:\n #docs: " + data[0]);
	     		console.log("Number of Docs updated in database: " + data[1]);
	     		console.log("Operation complete");
	  		}
	   });
	});

	$('#c').on('submit', function(e) {
		e.preventDefault();
		$(this).ajaxSubmit({
			success: function(data, status, xhr, $form){
				document.getElementById('c').reset();
				console.log("There are " + data.num + " docs in the database");
	  		}
	   });
	});

	$('#a').on('submit', function(e) {
		e.preventDefault();
		$(this).ajaxSubmit({
			success: function(data, status, xhr, $form) {
				document.getElementById('a').reset();
				console.log("The following document has been inserted");
				console.log("into the database: ");
				console.log(data);
	  		}
	   });
	});
	
	$('#find').on('click', function(e) {
	   e.preventDefault();
	   var forReq = {};
		for (var i = 0; i < docs.length; i++) {
			if (docs[i]._id === mouse.id ) {
				forReq.geo = docs[i];
				break;
			}
		}
	   $.ajax({
			type: "POST",
			url: 'within',
			data: forReq,
			success: function(data, textStatus, jqXHR) {
				console.log(data);
				/*for (var i = 0; i < data.length; i++) {
					if (data[i].political === "COUNTRY") 
						console.log("found a country");
					if (data[i].political === "STATE")
						console.log("found a state");
					if (data[i].political === "COUNTY")
						console.log(data[i].containers[0]);
					if (data[i].political == "CITY")
						console.log("found a city");
				}*/
			}
		});
	});
});