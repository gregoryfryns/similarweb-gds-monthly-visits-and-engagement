/* global CacheService, UrlFetchApp, DataStudioApp, Utilities */

/* istanbul ignore next */
if (typeof(require) !== 'undefined') {
  var ChunkyCache = require('./ChunkyCache.js')['default'];
}

/**
 * Tries to retrieve the requested data from the cache, and calls the API if not successful
 *
 * @param {string} url - url to the desired API endpoint
 * @param {?object} params - object that contains the URL parameters and their values
 * @return {object} - Results, or null if the API call wasn't successful
 */

/* istanbul ignore next */
function retrieveOrGet(url, params) {
  if (typeof params === 'undefined') { params = {}; }

  var cache = new ChunkyCache(CacheService.getUserCache());
  var cacheKey = cache.buildCacheKey(url, params);
  var data;

  try {
    data = cache.get(cacheKey);
    console.log('retrieveOrGet: Fetched successfully from cache', cacheKey);
  }
  catch (e) {
    console.log('retrieveOrGet: Error when fetching from cache:', cacheKey, e);
  }

  if (!data) {
    data = httpGet(url, params);
    if (data) {
      try {
        cache.put(cacheKey, data);
      }
      catch (e) {
        console.log('Error when storing in cache', cacheKey, e);
      }
    }
  }

  return data;
}

/**
 * Send a HTTP GET request to an API endpoint and return the results in a JavaScript object
 *
 * @param {string} url - url to the desired API endpoint
 * @param {object} params - object that contains the URL parameters and their values
 * @param {?number} retries - number of subsequent retries to perform if the API call fails, default 3
 * @return {object} Results returned by the API, or null if the API call wasn't successful
 */

/* istanbul ignore next */
function httpGet(url, params, retries) {
  if (typeof(retries) == 'undefined') {
    retries = 3;
  }

  var urlParams = Object.keys(params).map(function(k) {return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  var fullUrl = url + (urlParams.length > 0 ? '?' + urlParams : '');

  console.log('Fetching', fullUrl.replace(/api_key=[0-9a-f]{26}/gi, 'api_key=xxxxxxxxxxx'));
  try {
    var response = UrlFetchApp.fetch(fullUrl);
  }
  catch (e) {
    DataStudioApp.createCommunityConnector()
      .newUserError()
      .setDebugText('Could not contact the SimilarWeb API. Exception details: ' + e)
      .setText('There was an error communicating with the service. Try again later, or file an issue if this error persists.')
      .throwException();
  }
  console.log('Response', response);

  // If server too busy, retry
  if (response.getResponseCode() == 429 && retries > 0) {
    Utilities.sleep(500); // wait 0.5s before trying again
    return httpGet(url, params, retries - 1);
  }

  var data = null;

  try {
    data = JSON.parse(response.getContentText());
  }
  catch (e) {
    DataStudioApp.createCommunityConnector()
      .newUserError()
      .setDebugText('Could not parse JSON reply. Exception details: ' + e)
      .setText('There was an error communicating with the service. Try again later, or file an issue if this error persists.')
      .throwException();
  }

  return data;
}

/**
 * Retrieve API results (from the cache or the API) and return them in an array of objects
 *
 * @param {string[]} urls - array with urls to be called
 * @return {object[]} Results returned by the API, matching the order of the input urls (result[0] is the response to url[0] etc...)
 */

/* istanbul ignore next */
function retrieveOrGetAll(urls) {
  var HTTP_GET_RETRIES = 5;
  var cache = new ChunkyCache(CacheService.getUserCache());
  var resultsDict = {};
  var toApi = [];

  urls.forEach(function(url) {
    var cacheKey = cache.buildCacheKey(url);
    var data = null;
    try {
      data = cache.get(cacheKey);
      console.log('retrieveOrGetAll: Fetched succesfully from cache', cacheKey);
    }
    catch (e) {
      console.log('retrieveOrGetAll: Error when fetching from cache:', cacheKey, e);
      toApi.push(url);
    }
    if (!data) {
      toApi.push(url);
      console.log('No data cached for ', cacheKey, ', calling API');
    }
    else {
      resultsDict[url] = data;
      console.log('Cached data for ', cacheKey, ':', JSON.stringify(data));
    }
  });

  var apiResponses = httpGetAll(toApi, HTTP_GET_RETRIES);
  apiResponses.forEach(function(response, i) {
    if (response && response.meta) {
      var cacheKey = cache.buildCacheKey(toApi[i]);
      try {
        cache.put(cacheKey, response);
      }
      catch (e) {
        console.log('Error when storing in cache', cacheKey, e);
      }
      resultsDict[toApi[i]] = response;
    }
  });

  var result = urls.map(function(url) { return resultsDict[url]; });

  return result;
}

/**
 * Send a asynchronous HTTP GET requests return the results as in an array of objects
 *
 * @param {string[]} urls - array with urls to be called
 * @param {?number} retries - number of subsequent retries to perform if the API call fails, default 3
 * @return {object[]} Results returned by the API, matching the order of the input urls (result[0] is the response to url[0] etc...)
 */

/* istanbul ignore next */
function httpGetAll(urls, retries) {
  if (typeof(retries) == 'undefined') { retries = 3; }
  var resultsDict = {};
  var retry = [];
  try {
    var responses = UrlFetchApp.fetchAll(urls);
  }
  catch (e) {
    DataStudioApp.createCommunityConnector()
      .newUserError()
      .setDebugText('Error calling the SW API:' + e)
      .setText('There was an error communicating with the service. Try again later, or file an issue if this error persists.')
      .throwException();
  }

  responses.forEach(function(response, i) {
    var data = JSON.parse(response);
    if (data && data.meta && data.meta.status == 'Success') {
      resultsDict[urls[i]] = data;
    }
    else {
      retry.push(urls[i]);
    }
  });

  if (retry.length > 0) {
    if (retries > 0) {
      console.warn('HTTP Get failed for urls: ', JSON.stringify(retry), ' - ', retries, ' attempts left');
      Utilities.sleep(1000); // wait 1s before retrying
      httpGetAll(retry, retries - 1).forEach(function(x, j) {
        resultsDict[retry[j]] = x;
      });
    }
    else {
      console.error('Could not retrieve data from API for urls: ', JSON.stringify(retry));
    }
  }

  var result = urls.map(function(url) { return resultsDict.hasOwnProperty(url) ? resultsDict[url] : null; });

  return result;
}

/**
 * Extracts the month from a date formatted as YYYY-MM-DD
 *
 * @param {string} dateString - date formatted as YYYY-MM-DD
 * @return {string} Month, formatted as YYYY-MM
 */
function dateToYearMonth(dateString) {
  return dateString.split('-').slice(0, 2).join('-');
}

/**
 * Takes an endpoint URL and an object with the parameters to be added to the HTTP GET request,
 * and returns the full URL with the appended parameters
 *
 * @param {string} url - Url to the desired enpoint, without parameters
 * @param {?object} params - Object with the parameters to be passed in the HTTP GET request
 * @return {string} Full URL with the parameters appended to the endpoint name
 */
function buildUrl(url, params) {
  if (typeof(params) == 'undefined') { params = {}; }
  var urlParams = Object.keys(params).map(function(k) {return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  var fullUrl = url + (urlParams.length > 0 ? '?' + urlParams : '');

  return fullUrl;
}

/* global exports */
/* istanbul ignore next */
if (typeof(exports) !== 'undefined') {
  exports['__esModule'] = true;
  exports['retrieveOrGet'] = retrieveOrGet;
  exports['retrieveOrGetAll'] = retrieveOrGetAll;
  exports['dateToYearMonth'] = dateToYearMonth;
  exports['buildUrl'] = buildUrl;
}
