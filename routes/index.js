var fs = require('graceful-fs');
var async = require('async');
var natural = require('natural');
var ObjectID = require('mongodb').ObjectID;

/* ----------------------------------------------------------------- */
/* removes duplicates from an array                                  */
/* ----------------------------------------------------------------- */

//TODO:  there are two for Golden Valley, Montana
// TODO:  New York CITY should be added to names
Array.prototype.getUnique = function() {
   var u = {}, a = [];
   for(var i = 0; i < this.length; i++){
      if(u.hasOwnProperty(this[i]._id)) {
         continue;
      }
      a.push(this[i]);
      u[this[i]._id] = 1;
   }
   return a;
}

/* ----------------------------------------------------------------- */
/* removes duplicate coordinates from a GeoJSON polygon              */
/* ----------------------------------------------------------------- */

//TODO: mention this to PLoM; still consider using Natural Earth Files
Array.prototype.getPolygon = function(next) {
   var u = {}, a = [];
   for(var i = 0; i < this.length; i++){
      if(u.hasOwnProperty(this[i])) {
         continue;
      }
      a.push(this[i]);
      u[this[i]] = 1;
   }
   next(null, a);
}

/* ----------------------------------------------------------------- */
/* removes the specified political type from the array               */
/*    pol:  the political type specified
/* ----------------------------------------------------------------- */

Array.prototype.removePolitical = function(pol) {
   a = [];
   for(var i = 0; i < this.length; i++){
      if(this[i].political === pol) continue;
      a.push(this[i]);
   }
   return a;
}

/* ----------------------------------------------------------------- */
/* returns a cleaned-up query term                                   */
/*    query: the term being "cleaned"                                */
/*    isRecursive: is this a recursive call?                         */
/*    next: callback function                                        */ 
/* ----------------------------------------------------------------- */

//TODO:  still needs to be refined?? - deal with hyphens
function clean(query, isRecursive, next) {
  var forRet = [];
  //console.log(query);
  var upper = query.toUpperCase();
  var noPunctuation = upper.replace(/[^\w\s,]|_/g, " ");
  var trimmed = noPunctuation.trim();
  var noWhiteSpace = trimmed.replace(/[ \t\r]+/g,"_");
  //console.log(noWhiteSpace);
  var parts = noWhiteSpace.split(",");
  if (parts.length > 1) {
    for (var i = 0; i < parts.length; i++) {
      clean(parts[i], true, function(err, part) {
        if (err) return next(err);
        forRet.push(part);
        if (forRet.length == parts.length) next(null, forRet);
      });
    }
  }
  if (isRecursive) next(null, parts[0]);
  else {
    forRet.push(parts[0]);
    next(null, forRet);
  }
};

/* ----------------------------------------------------------------- */
/* returns an array of all of the files in the given directory (and) */
/* also any subdirectires                                            */
/*    dir:  the directory to be walked                               */
/*    next: the callback                                             */
/* ----------------------------------------------------------------- */

function walk(dir, next) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return next(err);
    var pending = list.length;
    if (!pending) return next(null, results);
    list.forEach(function(file) {
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) next(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) next(null, results);
        }
      });
    });
  });
}

/* ----------------------------------------------------------------- */
/* returns an array of the geo.json files found in the given array   */
/*    results:  an array of files                                    */
/*    next:  the callback                                            */
/* ----------------------------------------------------------------- */

function isGeoJSON(results, next) {
  var jsons = [];
  var max = results.length;
  var isMax = 0;
  results.forEach(function(file) {
      var parts = file.split('.');
      if (parts.length >= 3) {
        var ext = parts[parts.length -2];
        var ext2 = parts[parts.length -1]
        if ((ext.toLowerCase() === 'geo') && 
            (ext2.toLowerCase() === 'json')) { jsons.push(file); };
      }
      isMax++;
      if (isMax === max) {
        if (jsons) next(null, jsons);
        else console.log("problem with isGeoJSON");
      }
    });
};


/* ----------------------------------------------------------------- */
/* reads the given geoJSON file from the file Path and inserts it in */
/* the geo collection of MongoDB data                                */
/*                                                                   */
/*    dataPath: filePath of GeoJSON file on server                   */
/*    collection: the MongoDB collection for the document insert     */
/*    ft: features object from GeoJSON file                          */
/*    j: if a Multi-Polygon, the array index of coordinates object   */
/*    multi: is a non-coordinated index for a Multi-Polygon GeoJSON? */
/*           (known as a Multi-Parent)                               */
/*    id: the ObjectID of the Multi-Parent, if any                   */
/*    next: the callback                                             */
/* ----------------------------------------------------------------- */

function getCity(dataPath, collection, ft, next) {
  var mDoc = {};
  var loc = {};
  var names = [];
  var container = [];

  var cd = ft.geometry.coordinates;
  if (ft.properties.NAME) {
    var upper = ft.properties.NAME.toUpperCase();
    var trimmed = upper.trim();
    var noWhiteSpace = trimmed.replace(/[ \t\r]+/g,"_");
    names.push(noWhiteSpace); 
  }
  if (ft.properties.ADM0NAME) {
    var upper = ft.properties.ADM0NAME.toUpperCase();
    var trimmed = upper.trim();
    var noWhiteSpace = trimmed.replace(/[ \t\r]+/g,"_");
    container.push(noWhiteSpace);
  }
  Object.defineProperty(mDoc, "political", {value: "CITY", 
    enumerable: true, writable: true, configurable: true});
  Object.defineProperty(mDoc, "containers", {value: container, 
    enumerable: true, writable: true, configurable: true});
  Object.defineProperty(loc, "type", {value: "Point", 
    enumerable: true, writable: true, configurable: true});
  Object.defineProperty(loc, "coordinates", 
    {value: cd, enumerable: true, writable: true, 
    configurable: true});
  Object.defineProperty(mDoc, "loc", {value: loc, 
    enumerable: true, writable: true, configurable: true});
  Object.defineProperty(mDoc, "filePath", {value: dataPath, 
    enumerable: true, writable: true, configurable: true});
  Object.defineProperty(mDoc, "names", {value: names, 
    enumerable: true, writable: true, configurable: true});
  collection.insert(mDoc, function(err, doc){
    if(err) return next(err);
    next(null, null);
  }); 
}

/* ----------------------------------------------------------------- */
/* makes the coordinates array for each polygon begin and end on the */
/* same coordinate, enabling the Mongo DB inde                       */
/*    coorinates: the coordinates array for a GeoJSON Polygon type   */
/*    multi: is a Multi-Parent                                       */
/*    next: the callback                                             */
/* ----------------------------------------------------------------- */

function fixCoordinates(coordinates, multi, next) {
  
  if (multi) next(null, coordinates);
  else {
    // if an error is triggered at this line, please contact 
    // mark92fillmore
    if (coordinates === null) next(404);
    else {
      var num = coordinates.length;
      var newCoordinates = [];
      for (var i = 0; i < num; i++) {
        //var newCD = coordinates[i].getPolygon();
        coordinates[i].getPolygon(function(err, newCD) {
          if(err) return next(err);
        //TODO: how to ensure that the above finishes before the next 
        // code executes? do I need to go this in a callback form?
        var length = newCD.length-1;
        xZero = newCD[0][0];
        xOne = newCD[length][0];
        yZero = newCD[0][1];
        yOne = newCD[length][1];
        //console.log("xZero = " + xZero);
        //console.log("xOne = " + xOne);
        //console.log("yZero = " + yZero);
        //console.log("yOne = " + yOne);
          newCD.push(newCD[0]);
        newCoordinates.push(newCD);
        if (i == num - 1) next(null, newCoordinates);
      });
        /*var length = coordinates[i].length-1;
        xZero = coordinates[i][0][0];
        xOne = coordinates[i][length][0];
        yZero = coordinates[i][0][1];
        yOne = coordinates[i][length][1];
        //console.log("xZero = " + xZero);
        //console.log("xOne = " + xOne);
        //console.log("yZero = " + yZero);
        //console.log("yOne = " + yOne);
        if ((xZero !== xOne) || (yZero !== yOne)) coordinates[i].push(coordinates[i][0]);
        //newCoordinates.push(newCD);
        if (i == num - 1) next(null, coordinates)*/

      }
    }
  }
};

/* ----------------------------------------------------------------- */
/* reads the given geoJSON file from the file Path and inserts it in */
/* the geo collection of MongoDB data                                */
/*                                                                   */
/*    dataPath: filePath of GeoJSON file on server                   */
/*    collection: the MongoDB collection for the document insert     */
/*    ft: features object from GeoJSON file                          */
/*    j: if a Multi-Polygon, the array index of coordinates object   */
/*    multi: is a non-coordinated index for a Multi-Polygon GeoJSON? */
/*           (known as a Multi-Parent)                               */
/*    id: the ObjectID of the Multi-Parent, if any                   */
/*    next: the callback                                             */
/* ----------------------------------------------------------------- */

//TODO: specify the schema for these documents
function getDoc(dataPath, collection, ft, j, multi, id, next) {
  var mDoc = {};
  var loc = {};
  var names = [];
  var container = [];

  if (!multi) {
    if (j !== null) {
      var cd = ft.geometry.coordinates[j];
      // if an error occurred here, notify mark92fillmore
      if (id === null) return next(err);
      Object.defineProperty(mDoc, "multi", {value: id, enumerable: true,
        writable: true, configurable: true});
    }
    else var cd = ft.geometry.coordinates;
  }
  else {
    Object.defineProperty(mDoc, "isMulti", {value: true, enumerable: true,
      writable: true, configurable: true});
  }
  fixCoordinates(cd, multi, function(err, newCD) {
    if (err) return next(err);

    if (ft.properties.name) { 
      var upper = ft.properties.name.toUpperCase();
      var trimmed = upper.trim();
      var noWhiteSpace = trimmed.replace(/[ \t\r]+/g,"_");
      names.push(noWhiteSpace); 
    }
    if (ft.id) { 
      //TODO: use clean
      var upper = ft.id.toUpperCase();
      var trimmed = upper.trim();
      var noWhiteSpace = trimmed.replace(/[ \t\r]+/g,"_");
      var re = /^USA-.+/;
      if (re.test(noWhiteSpace)) { 
        Object.defineProperty(mDoc, "political", {value: "STATE", 
          enumerable: true, writable: true, configurable: true});
        container.push("USA");
        container.push("UNITED_STATES_OF_AMERICA");
      }
      names.push(noWhiteSpace); 
    }
    if (ft.properties.state) {
      var upper = ft.properties.state.toUpperCase();
      var trimmed = upper.trim();
      var noWhiteSpace = trimmed.replace(/[ \t\r]+/g,"_");
      container.push(noWhiteSpace);
    }
    if (ft.properties.kind) {
      var upper = ft.properties.kind.toUpperCase();
      var trimmed = upper.trim();
      var noWhiteSpace = trimmed.replace(/[ \t\r]+/g,"_");
      Object.defineProperty(mDoc, "political", {value: noWhiteSpace, 
         enumerable: true, writable: true, configurable: true});
      container.push("USA");
      container.push("UNITED_STATES_OF_AMERICA");
    }
    if (container.length === 0) {
      Object.defineProperty(mDoc, "political", {value: "COUNTRY", 
         enumerable: true, writable: true, configurable: true});
      var isCountry = "CONTINENT";
      container.push(isCountry);
    }
    Object.defineProperty(mDoc, "containers", {value: container, 
      enumerable: true, writable: true, configurable: true});
     if (!multi) {
      Object.defineProperty(loc, "type", {value: "Polygon", 
        enumerable: true, writable: true, configurable: true});
      Object.defineProperty(loc, "coordinates", 
        {value: newCD, enumerable: true, writable: true, 
        configurable: true});
      Object.defineProperty(mDoc, "loc", {value: loc, 
        enumerable: true, writable: true, configurable: true});
    }
    Object.defineProperty(mDoc, "filePath", {value: dataPath, 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(mDoc, "names", {value: names, 
      enumerable: true, writable: true, configurable: true});
    if (j === null) { 
      collection.insert(mDoc, function(err, doc){
        if(err) return next(err);
        next(null, null);
      }); 
    }
    else {
      collection.insert(mDoc, function(err, doc){
        if(err) return next(err);
        if (multi) return next(null, doc[0]._id);
        next(null, null);
      });
    }
  });
}

/* ----------------------------------------------------------------- */
/* reads the given geoJSON file from the file Path and inserts it in */
/* the geo collection of MongoDB data                                */
/*    dataPath:  file path on the server for the given GeoJSON       */
/*    collection: the collection into which documents should be      */
/*                inserted                                           */
/*    next: the callback                                             */
/* ----------------------------------------------------------------- */

function readGeoJSON(dataPath, collection, next) {
  fs.readFile(dataPath, 'utf-8', function(err, data) {
      //console.log("I'm changing the database");
      if(err) return next(err);
      var newData = JSON.parse(data);
      var type = newData.type;
      var points = 0;
      if (type === "FeatureCollection") {
        var features = newData.features;
        //TODO: check these error codes again
        if (features === null) { throw(err); }
        var length = features.length;
        for (var i = 0; i < length; i++) {
          var ft = features[i];
          var geoType = ft.geometry.type;
          if (geoType === "Polygon") { 
            getDoc(dataPath, collection, ft, null, null, null, 
              function(err, id) {
                if (err) return next(err);
                next(null);
            });
          }
          if (geoType === "MultiPolygon") {
            var cLength = ft.geometry.coordinates.length;
            var forRes = new Array(cLength);
            getDoc(dataPath, collection, ft, cLength, true, false, 
                   function(err, id) {
                     if (err) return next(err);
                     //console.log(id);
                     for (var j = 0; j < cLength; j++) {
                      getDoc(dataPath, collection, ft, j, false, id, 
                              function(err, id) {
                                points++;
                                if (points === cLength) next(null);
                       });
                     }
            });
          }
          if (geoType === "Point") {
            getCity(dataPath, collection, ft, function(err, id) {
              if (err) return next(err);
              //console.log("updated city");
              points++;
              if (points === length) {
                next(null);
                //console.log("response should have been sent");
              }
            });
          }
        } // for (var i = 0; i < length; i++) {}
      } // if (type === "FeatureCollection") {
      // if an error occurs here, please notify mark92fillmore
      else next(404);
  }); // fs.readFile(dataPath, 'utf-8', function(err, data) {
} // function readGeoJSON(dataPath, next) {


/* ----------------------------------------------------------------- */
/* remove the data from the geo collection of MongoDB data;          */
/* recompiles the geo collection of the MongoDB data                 */
/* ----------------------------------------------------------------- */

exports.test = function(req, res, next) {
  console.log("testing");
  var collection = req.app.get('geo');
  async.series([
        function(callback){
          console.log("deleting");
          collection.remove(function(err, doc) {
            if (err) return next(err);
            collection.count(function(err, count) {
              if (err) return next(err);
              callback(null, count);
            });
          });
        },
        function(callback){
          console.log("adding");
          walk("public/data", function(err, results) {
            if (err) throw err;
            isGeoJSON(results, function(err, geoJsons) {
              var newMax = geoJsons.length;
              var isNewMax = 0;
              geoJsons.forEach(function(file) {
                //console.log("reading file: " + file);
                readGeoJSON(file, collection, function(err) {
                  if (err) return next(err);
                  isNewMax++;
                  if (isNewMax === newMax) {
                    collection.count(function(err, count) {
                      if(err) return next(err);
                      console.log("docs: " + count);
                      console.log("files: " + newMax);
                      callback(null, count);
                    });
                  }
                });
              });
            });
          });
        },
        //TODO: eventually, index should be built based on ascending views
        function(callback) {
          console.log("creating index");
          collection.ensureIndex({loc: "2dsphere"}, function(err) {
            if (err) return next(err);
            console.log("Index has been created!!!");
            callback(null, true);
          });
        }
      ],
      function(err, results) {
        console.log("in callback");
        if (err) return next(err);
        res.send(results);
      }
  ); 
};

/* ----------------------------------------------------------------- */
/* increments the "used" field for the specified document            */
/*    collection:  the MongoDB collection with the document          */
/*    doc:  the document being used                                  */
/*    next: the callback                                             */
/* ----------------------------------------------------------------- */

//TODO: add a function in the public/javascripts that uses this search
// to then do a geoIntersects??
exports.oid = function(req, res, next){

  var collection = req.app.get('geo');
  var id = req.body.search;
  var query = new ObjectID(id);
  var cursor = collection.find({"_id": query});
  cursor.each(function(err, doc) {
    if (err) return next(err);
    if (doc) {
      if (doc.names) {
        var alt = doc.filePath;
        console.log(alt);
        res.send(alt);
      }
    }
    else {
      console.log("error");
      res.send(null);
    }
  });
};

/* ----------------------------------------------------------------- */
/* render the index page                                             */
/* ----------------------------------------------------------------- */

exports.index = function(req, res){
  res.render('index');
};

/* ----------------------------------------------------------------- */
/* returns metaData and coordinates of the specified location by ID  */
/* ----------------------------------------------------------------- */

//TODO: add a function in the public/javascripts that uses this search
// to then do a geoIntersects??
exports.oid = function(req, res, next){

  var collection = req.app.get('geo');
  var id = req.body.search;
  var query = new ObjectID(id);
  var cursor = collection.find({"_id": query});
  cursor.each(function(err, doc) {
    if (err) return next(err);
    if (doc) {
      if (doc.names) {
        var alt = doc.filePath;
        console.log(alt);
        res.send(alt);
      }
    }
    else {
      console.log("error");
      res.send(null);
    }
  });
};

/* ----------------------------------------------------------------- */
/* returns metaData and coordinates of the specified location        */
/* (search complete matches)                                         */
/*    place:  the main search term (to be found in "names")          */
/*    collection:  the collection to be searched                     */
/*    restrictions:  geographic locations containing 'place,' to     */
/*                   trim the number of results                      */
/*    next:  the callback                                            */ 
/* ----------------------------------------------------------------- */

//TODO: make sure restrictions are planned; implement sorting by views
function full(place, collection, restrictions, next) {
  console.log("calling full");
  var reg = new RegExp("^" + place);
  if (restrictions == null) var col = new RegExp('.*');
  else var col = new RegExp('.*' + restrictions + '.*')
  collection.find({"names": reg, "containers": col})
            .toArray(function(err, results) {
              if (err) return next(err);
              //console.log(results);
              next(null, results);   
            });
}; 

/* ----------------------------------------------------------------- */
/* returns metaData and coordinates of the specified location        */
/* (search for beginning substring)                                  */
/*    place:  the main search term (to be found in "names")          */
/*    collection:  the collection to be searched                     */
/*    restrictions:  geographic locations containing 'place,' to     */
/*                   trim the number of results                      */
/*    next:  the callback                                            */ 
/* ----------------------------------------------------------------- */

function begin(place, collection, restrictions, next) {
  console.log("calling begin");
  var reg = new RegExp("^" + place + ".*");
  if (restrictions == null) var col = new RegExp('.*');
  else var col = new RegExp('.*' + restrictions + '.*')
  collection.find({"names": reg, "containers": col})
            .toArray(function(err, results) {
              if (err) next(err);
              next(null, results);
            });
};

/* ----------------------------------------------------------------- */
/* returns metaData and coordinates of the specified location        */
/* (search for any substring)                                        */
/*    place:  the main search term (to be found in "names")          */
/*    collection:  the collection to be searched                     */
/*    restrictions:  geographic locations containing 'place,' to     */
/*                   trim the number of results                      */
/*    next:  the callback                                            */ 
/* ----------------------------------------------------------------- */

function sub(place, collection, restrictions, next) {
  console.log("calling sub");
  var reg = new RegExp(".*" + place + ".*");
  if (restrictions == null) var col = new RegExp('.*');
  else var col = new RegExp('.*' + restrictions + '.*')
  collection.find({"names": reg, "containers": col})  
            .toArray(function(err, results) {
              if (err) next(err);
              next(null, results);
            });
};

/* ----------------------------------------------------------------- */
/* returns metaData and coordinates of the specified location        */
/* ----------------------------------------------------------------- */

//TODO: restrictions still need to be refined
exports.search = function(req, res, next) {

  var collection = req.app.get('geo');
  var place = req.body.geo;
  clean(place, false, function(err, searches) {
    if (searches.length > 1) var restrictions = searches[1];
    else var restrictions = null;
    //TODO: why won't parallel work here??
    async.series([
      function(callback){
          full(searches[0], collection, restrictions, function(err, res) {
            if (err) return next(err);
            callback(null, res);
          });
        },
        function(callback){
          begin(searches[0], collection, restrictions, function(err, res) {
            if (err) return next(err);
            callback(null, res);
          });
        },
        function(callback){
          sub(searches[0], collection, restrictions, function(err, res) {
            if (err) return next(err);
            callback(null, res);
          });
        }
      ],
      function(err, results) {
        console.log("in callback");
        if (err) return next(err);
        var forRes = [];
        for (var i = 0; i < results.length; i++) {
          var inception = results[i];
          for (var j = 0; j < inception.length; j++) {
            forRes.push(inception[j]);
            //console.log(inception[j]);
          }
        }
        var forSend = forRes.getUnique();
        res.send(forSend);
      }
    ); 
  });
};

//TODO:  write about potentially using geo query to fill out container
//       array for cities??
/* ----------------------------------------------------------------- */
/* returns a loc object with coordinate pairs that are floats, not   */
/* strings                                                           */
/*    loc:  the location object being fixed                          */
/*    next:  the callback
/* ----------------------------------------------------------------- */

function floatCoordinates(loc, next) {
  var g = {};
  var coord = [];
  for (var l = 0; l < loc.coordinates.length; l++) {
    var second = [];
    for (var m = 0; m < loc.coordinates[l].length; m++) {
      var t = loc.coordinates[l][m];
      var x = parseFloat(t[0]);
      var y = parseFloat(t[1]);
      var third = [];
      third[0] = x;
      third[1] = y;
      second.push(third);
    }
    coord.push(second);
  }
  g.type = loc.type;
  g.coordinates = coord;
  next(null, g);
}

/* ----------------------------------------------------------------- */
/* TODO        */
/* ----------------------------------------------------------------- */

//TODO: restrictions still need to be refined
exports.within = function(req, res, next) {

  var term = req.body.geo;
  var collection = req.app.get('geo');
  var r = [];
  //console.log(term);
  if (term.isMulti) {
    var query = new ObjectID(term._id);
    collection.find({'multi': query}).toArray(function(err, results) {
       if (err) return next(err);
       var last = 0;
       for (var i = 0; i < results.length; i++) {
         floatCoordinates(results[i].loc, function(err, g) {
           //console.log(g);
           collection.find({'loc': 
             { '$geoWithin' :
               { '$geometry': g }
             }
           }).toArray(function(err, resultstwo) {
             if (err) return next(err);
             //console.log(i + " out of " + last);
             for (var j = 0; j < resultstwo.length; j++) {
               r.push(resultstwo[j]);
             }
             last++;
             if (last === results.length-1) {
               var newR = r.getUnique();
               if (term.political === "COUNTRY") {
                 newR = newR.removePolitical(term.political);
               }
               if (term.political === "STATE") {
                 newR = newR.removePolitical(term.political);
                 newR = newR.removePolitical("COUNTRY");
               }
               if (term.political === "COUNTY") {
                 newR = newR.removePolitical(term.political);
               }
               res.send(newR);
             }
          });
        });
      }
    });
  }
  else {
    if (term.loc.type === 'Point') res.send(null);
    else{
      //console.log(term.loc.coordinates);
      // for some reason, the query had all of the coordinates as strings
      // when just passing term.loc; that's the reason for this nonsense
      floatCoordinates(term.loc, function(err, g) {
        if (err) return next(err);
        collection.find({'loc': 
          { '$geoIntersects' :
            { '$geometry': g}
          }
        }).toArray(function(err, resultsthree) {
          if (err) return next(err);
          for (var k = 0; k < resultsthree.length; k++) {
            r.push(resultsthree[k]);
          }
           var newR = r.getUnique();
           if (term.political === "COUNTRY") {
             newR = newR.removePolitical(term.political);
           }
           if (term.political === "STATE") {
             newR = newR.removePolitical(term.political);
             newR = newR.removePolitical("COUNTRY");
           }
           if (term.political === "COUNTY") {
             newR = newR.removePolitical(term.political);
           }
           res.send(newR);
        });
      });
    }
  } 
};

/* ----------------------------------------------------------------- */
/* returns a count of the number of documents in the geo collection  */
/* ----------------------------------------------------------------- */

exports.count = function(req, res, next) {
  console.log("testing");
  var collection = req.app.get('geo');
  collection.count(function(err, count) {
    if(err) return next(err);
    console.log("docs: " + count);
    var forRes = {};
    forRes.num = count;
    res.send(forRes);
  });
};

/* ----------------------------------------------------------------- */
/* manually search the geo data for areas that are inside the        */
/* specified polygon                                                 */
/*    coordinates:  the coordinates for the drawn polygon            */
/*    next:  the callback                                            */
/* ----------------------------------------------------------------- */

//TODO:  fix this
function inPolygon(coordinates, next) {

  clean(place, false, function(err, names) {
    if (err) return next(err);
    var mDoc = {};
    var loc = {};
    var names = [];
    var container = [];
    var cd = [];
    if (names.length > 1) container[0] = names[1];
    cd[0] = lon;
    cd[1] = lat;
    names.push(names[0]); 
    Object.defineProperty(mDoc, "political", {value: "CITY", 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(mDoc, "containers", {value: container, 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(loc, "type", {value: "Point", 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(loc, "coordinates", 
      {value: cd, enumerable: true, writable: true, 
      configurable: true});
    Object.defineProperty(mDoc, "loc", {value: loc, 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(mDoc, "filePath", {value: null, 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(mDoc, "names", {value: names, 
      enumerable: true, writable: true, configurable: true});
    collection.insert(mDoc, function(err, doc){
      if(err) return next(err);
      next(null, doc);
    });   
  });
}

/* ----------------------------------------------------------------- */
/* manually upload the geo data for a city                           */
/*    collection:  the MongoDB collection into which the document    */
/*                 will be inserted
/*    place: the name of the city                                    */
/*    lon:  the longitude coordinate                                 */
/*    lat:  the latitude coordinate                                  */
/*    next:  the callback                                            */
/* ----------------------------------------------------------------- */

function insertCity(collection, place, lon, lat, next) {

  clean(place, false, function(err, names) {
    if (err) return next(err);
    var mDoc = {};
    var loc = {};
    var name = [];
    var container = [];
    var cd = [];
    if (names.length > 1) container[0] = names[1];
    cd[0] = parseFloat(lon);
    cd[1] = parseFloat(lat);
    name.push(names[0]); 
    Object.defineProperty(mDoc, "political", {value: "CITY", 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(mDoc, "containers", {value: container, 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(loc, "type", {value: "Point", 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(loc, "coordinates", 
      {value: cd, enumerable: true, writable: true, 
      configurable: true});
    Object.defineProperty(mDoc, "loc", {value: loc, 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(mDoc, "filePath", {value: null, 
      enumerable: true, writable: true, configurable: true});
    Object.defineProperty(mDoc, "names", {value: name, 
      enumerable: true, writable: true, configurable: true});
    // TODO: need to make an upsert
    collection.update({"names": name[0], "containers": container[0]},
     function(err, doc){
      if(err) return next(err);
      next(null, doc);
    });
  });
}

/* ----------------------------------------------------------------- */
/* manually upload the geo data for a city                           */
/* ----------------------------------------------------------------- */

exports.add = function(req, res, next) {
  var collection = req.app.get('geo');
  var place = req.body.p;
  var lat = req.body.lat;
  var lon = req.body.lon;
  insertCity(collection, place, lon, lat, function(err, doc) {
    if (err) return next(err);
    res.send(doc);
  })

}
/* ----------------------------------------------------------------- */
/* singular testing version of readGeoJSON                           */
/* ----------------------------------------------------------------- */

 /* exports.single = function(req, res, next) {
    console.log("testing...");
    var dataPath = req.files.file.path;
    //var fileName = req.files.file.name;
    var collection = req.app.get('geo');
    fs.readFile(dataPath, 'utf-8', function(err, data) {
      if(err) return next(err);
      var newData = JSON.parse(data);
      var type = newData.type;
      var points = 0;
      if (type === "FeatureCollection") {
        var features = newData.features;
        if (features === null) { throw(err); }
        var length = features.length;
        for (var i = 0; i < length; i++) {
          var ft = features[i];
          var geoType = ft.geometry.type;
          if (geoType === "Polygon") { 
            getDoc(dataPath, collection, ft, null, null, null, 
              function(err, id) {
                if (err) return next(err);
                console.log("Poly worked!")
            });
          }
          if (geoType === "MultiPolygon") {
            var cLength = ft.geometry.coordinates.length;
            var forRes = new Array(cLength);
            getDoc(dataPath, collection, ft, cLength, true, false, 
                   function(err, id) {
                     if (err) return next(err);
                     console.log(id);
                     for (var j = 0; j < cLength; j++) {
                      getDoc(dataPath, collection, ft, j, false, id, 
                              function(err, id) {
                                console.log("?");
                       });
                     }
            });
          }
          if (geoType === "Point") {
            getCity(dataPath, collection, ft, function(err, id) {
              if (err) return next(err);
              console.log("updated city");
              points++;
              if (points === length) {
                res.send(dataPath);
                console.log("response should have been sent");
              }
            });
          }
        } // for (var i = 0; i < length; i++) {}
      } // if (type === "FeatureCollection") {
      console.log("mark, you screwed up");
    }); // fs.readFile(dataPath, 'utf-8', function(err, data) {
  } // function readGeoJSON(dataPath, next) {*/
