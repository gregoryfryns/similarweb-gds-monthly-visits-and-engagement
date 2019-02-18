var DateUtils = {
  /*
  * Converts Date object to a String containing the date part (with dashes).
  *
  * @return {string} Date part. E.g. '2018-07-10'.
  */
  getDatePart: function(dateObject) {
    return dateObject.toISOString().slice(0, 10);
  }
}

if (typeof(exports) !== "undefined") {
  exports['__esModule'] = true;
  exports['default'] = DateUtils;
}
