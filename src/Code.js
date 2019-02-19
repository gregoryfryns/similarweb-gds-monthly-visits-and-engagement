/* global CacheService, UrlFetchApp, DataStudioApp */

if (typeof(require) !== 'undefined') {
  var DataCache = require('./DataCache.js')['default'];
}

// eslint-disable-next-line no-unused-vars
function getAuthType() {
  var response = { type: 'NONE' };
  return response;
}

// eslint-disable-next-line no-unused-vars
function getConfig() {
  var cc = DataStudioApp.createCommunityConnector();
  var config = cc.getConfig();

  config.newInfo()
    .setId('instructions')
    .setText('You can find your SimilarWeb API key or create a new one here (a SimilarWeb Pro account is needed): https://account.similarweb.com/#/api-management');

  config.newTextInput()
    .setId('apiKey')
    .setName('Your SimilarWeb API key')
    .setHelpText('Enter your 32-character SimilarWeb API key')
    .setPlaceholder('1234567890abcdef1234567890abcdef');

  config.newTextInput()
    .setId('domains')
    .setName('Domains')
    .setHelpText('Enter the name of up to 10 domains you would like to analyze, separated by commas (e.g. cnn.com, bbc.com, nytimes.com)')
    .setPlaceholder('cnn.com, bbc.com, nytimes.com')
    .setAllowOverride(true);

  config.newTextInput()
    .setId('country')
    .setName('Country Code')
    .setHelpText('ISO 2-letter country code of the country (e.g. us, gb - world for Worldwide)')
    .setPlaceholder('us')
    .setAllowOverride(true);

  return config.build();
}

// eslint-disable-next-line no-unused-vars
function getFields() {
  var cc = DataStudioApp.createCommunityConnector();
  var fields = cc.getFields();
  var types = cc.FieldType;
  var aggregations = cc.AggregationType;

  fields.newDimension()
    .setId('date')
    .setName('Date')
    .setType(types.YEAR_MONTH_DAY);

  fields.newDimension()
    .setId('domain')
    .setName('Domain')
    .setType(types.TEXT);

  fields.newDimension()
    .setId('device')
    .setName('Device')
    .setType(types.TEXT);

  fields.newMetric()
    .setId('visits')
    .setName('Visits')
    .setType(types.NUMBER)
    .setAggregation(aggregations.SUM);

  return fields;
}

// eslint-disable-next-line no-unused-vars
function getSchema(request) {
  var fields = getFields().build();
  return { schema: fields };
}

// eslint-disable-next-line no-unused-vars
function getData(request) {
  var MAX_NB_DOMAINS = 10;
  var country = request.configParams.country;
  var apiKey = request.configParams.apiKey;
  var domains = request.configParams.domains.split(',').slice(0, MAX_NB_DOMAINS).map(function(domain) {
    return domain.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').replace(/\/.*$/i, '').toLowerCase();
  });

  var requestedFieldIDs = request.fields.map(function(field) {
    return field.name;
  });
  var requestedFields = getFields().forIds(requestedFieldIDs);

  // Fetch and parse data from API
  var data = {};
  domains.forEach(function (dom) {
    if (dom) {
      var cache = new DataCache(CacheService.getUserCache(), apiKey, dom, country);
      var domData = fetchFromCache(cache);
      if (!domData) {
        domData = fetchFromAPI(dom, country, apiKey);
        setInCache(domData, cache);
      }
      data[dom] = domData;
    }
  });

  return {
    schema: requestedFields.build(),
    rows: buildTabularData(requestedFields, data)
  };
}

// eslint-disable-next-line no-unused-vars
function isAdminUser() {
  return true;
}

function buildTabularData(requestedFields, data) {
  var requestedData = [];
  Object.keys(data).forEach(function(dom) {
    var desktopData = data[dom].desktop;
    Object.keys(desktopData).forEach(function(date) {
      var dailyValues = desktopData[date];
      var row = [];

      requestedFields.asArray().forEach(function (field) {
        switch (field.getId()) {
        case 'visits':
          row.push(dailyValues.visits);
          break;
        case 'date':
          row.push(date.replace(/-/g, ''));
          break;
        case 'domain':
          row.push(dom);
          break;
        case 'device':
          row.push('Desktop');
          break;
        default:
          row.push('');
        }
      });
      requestedData.push({ values: row });
    });

    var mobileData = data[dom].desktop;
    Object.keys(mobileData).forEach(function(date) {
      var dailyValues = mobileData[date];
      var row = [];

      requestedFields.asArray().forEach(function (field) {
        switch (field.name) {
        case 'visits':
          row.push(dailyValues.visits);
          break;
        case 'date':
          row.push(date.replace(/-/g, ''));
          break;
        case 'domain':
          row.push(dom);
          break;
        case 'device':
          row.push('Desktop');
          break;
        default:
          row.push('');
        }
      });
      requestedData.push({ values: row });
    });
  });

  return requestedData;
}

function fetchFromAPI(domain, country, apiKey) {
  var result = { desktop: {}, mobile: {} };

  var params = {
    api_key: apiKey,
    country: country,
    main_domain_only: 'false',
    show_verified: 'false'
  };

  // Fetch and parse data from API
  var desktopVisits = httpGet('https://api.similarweb.com/v1/website/' + domain + '/traffic-and-engagement/visits-full', params);
  if (desktopVisits && desktopVisits.visits) {
    desktopVisits.visits.forEach(function(day) {
      var date = day.date;
      if (!result.desktop.hasOwnProperty(date)) {
        result.desktop[date] = {};
      }
      result.desktop[date].visits = day.visits;
    });
  }

  var mobileVisits = httpGet('https://api.similarweb.com/v2/website/' + domain + '/mobile-web/visits-full', params);
  if (mobileVisits && mobileVisits.visits) {
    mobileVisits.visits.forEach(function(day) {
      var date = day.date;
      if (!result.mobile.hasOwnProperty(date)) {
        result.mobile[date] = {};
      }
      result.mobile[date].visits = day.visits;
    });
  }

  return result;
}

function fetchFromCache(cache) {
  var data = null;
  console.log('Trying to fetch from cache...', 'xxxxxxxxxxxxxxxx' + cache.cacheKey.slice(-1 * (cache.cacheKey.length - 26)));
  try {
    var dataString = cache.get();
    data = JSON.parse(dataString);
    console.log('Fetched succesfully from cache');
  } catch (e) {
    console.log('Error when fetching from cache:', e);
  }

  return data;
}

function setInCache(data, cache) {
  console.log('Setting data to cache...', 'xxxxxxxxxxxxxxxx' + cache.cacheKey.slice(-1 * (cache.cacheKey.length - 26)));
  try {
    cache.set(JSON.stringify(data));
  } catch (e) {
    console.log('Error when storing in cache', e);
  }
}

/**
 * Send a HTTP GET request to an API endpoint and return the results in a JavaScript object
 *
 * @param {String} url - url to the desired API endpoint
 * @param {object} params - object that contains the URL parameters and their values
 * @return {object} Results returned by the API, or null if the API call wasn't successful
 */
function httpGet(url, params) {
  if (typeof params === 'undefined') {
    params = {};
  }

  var urlParams = Object.keys(params).map(function(k) {return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  var fullUrl = url + (urlParams.length > 0 ? '?' + urlParams : '');

  console.log('Fetching', fullUrl.replace(/api_key=[0-9a-f]{26}/gi, 'api_key=xxxxxxxxxxx'));
  var response = UrlFetchApp.fetch(fullUrl, { 'muteHttpExceptions': true });
  console.log('Response', response);

  var data = JSON.parse(response);

  return data;
}
