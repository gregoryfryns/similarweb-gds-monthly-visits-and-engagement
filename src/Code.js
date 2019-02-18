/* global CacheService, UrlFetchApp */

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
  var config = {
    configParams: [
      {
        type: 'INFO',
        name: 'instructions',
        text: 'You can find your SimilarWeb API key or create a new one here (a SimilarWeb Pro account is needed): https://account.similarweb.com/#/api-management'
      },
      {
        type: 'TEXTINPUT',
        name: 'apiKey',
        displayName: 'Your SimilarWeb API key',
        helpText: 'Enter your 32-character SimilarWeb API key',
        placeholder: '1234567890abcdef1234567890abcdef'
      },
      {
        type: 'TEXTINPUT',
        name: 'domains',
        displayName: 'Domains',
        helpText: 'Enter the name of up to 10 domains you would like to analyze, separated by commas (e.g. cnn.com, bbc.com, nytimes.com)',
        placeholder: 'cnn.com, bbc.com, nytimes.com'
      },
      {
        type: 'TEXTINPUT',
        name: 'country',
        displayName: 'Country Code',
        helpText: 'ISO 2-letter country code of the country (e.g. us, gb - world for Worldwide)',
        placeholder: 'us'
      }
    ],
    dataRangeRequired: true
  };
  return config;
}

// eslint-disable-next-line no-unused-vars
function getSchema(request) {
  return {
    schema: [
      {
        name: 'visits',
        dataType: 'NUMBER',
        semantics: {
          conceptType: 'METRIC',
          semanticType: 'NUMBER',
          isReaggregatable: true
        },
        defaultAggregationType: 'SUM'
      },
      {
        name: 'date',
        dataType: 'STRING',
        semantics: {
          conceptType: 'DIMENSION',
          semanticType: 'YEAR_MONTH_DAY'
        }
      },
      {
        name: 'domain',
        dataType: 'STRING',
        semantics: {
          conceptType: 'DIMENSION',
        }
      },
      {
        name: 'device',
        dataType: 'STRING',
        semantics: {
          conceptType: 'DIMENSION',
        }
      }
    ]
  };
}

// eslint-disable-next-line no-unused-vars
function getData(request) {
  var domains = request.configParams.domains.split(',').slice(0, 10).map(function(x) {return x.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').replace(/\/.*$/i, '').toLowerCase();}),
    apiKey = request.configParams.apiKey,
    country = request.configParams.country,
    data = { desktop: {}, mobile: {} };

  for (var i in domains) {
    var dom = domains[i];

    var cache = new DataCache(CacheService.getUserCache(), apiKey, dom, country);
    var domData = null;

    domData = fetchFromCache(cache);
    if (!domData) {
      domData = fetchFromAPI(dom, country, apiKey);
      setInCache(domData, cache);
    }
    data[dom] = domData;
  }

  return buildTabularData(data, prepareSchema(request));
}

// eslint-disable-next-line no-unused-vars
function isAdminUser() {
  return true;
}

function buildTabularData(data, dataSchema) {
  var requestedData = [],
    desktopData,
    mobileData;
  Object.keys(data).forEach(function(dom) {
    desktopData = data[dom].desktop;
    if (desktopData && desktopData.visits) {
      desktopData.visits.forEach(function(dailyVisits) {
        var values = [];
        dataSchema.forEach(function (field) {
          switch (field.name) {
          case 'visits':
            values.push(dailyVisits.visits);
            break;
          case 'date':
            values.push(dailyVisits.date.replace(/-/g, ''));
            break;
          case 'domain':
            values.push(dom);
            break;
          case 'device':
            values.push('Desktop');
            break;
          default:
            values.push('');
          }
        });
        requestedData.push({ values: values });
      });
    }
    mobileData = data[dom].mobile;
    if (mobileData && mobileData.visits) {
      mobileData.visits.forEach(function(dailyVisits) {
        var values = [];
        dataSchema.forEach(function (field) {
          switch (field.name) {
          case 'visits':
            values.push(dailyVisits.visits);
            break;
          case 'date':
            values.push(dailyVisits.date.replace(/-/g, ''));
            break;
          case 'domain':
            values.push(dom);
            break;
          case 'device':
            values.push('Mobile Web');
            break;
          default:
            values.push('');
          }
        });
        requestedData.push({ values: values });
      });
    }
  });

  return {
    schema: dataSchema,
    rows: requestedData
  };
}

function fetchFromAPI(domain, country, apiKey) {
  var result = {},
    response;

  // Fetch and parse data from API
  var urlDesktop = [
    'https://api.similarweb.com/v1/website/',
    domain,
    '/traffic-and-engagement/visits-full',
    '?api_key=', apiKey,
    '&country=', country,
    '&main_domain_only=false',
    '&show_verified=false'
  ].join('');

  console.log('Fetching', urlDesktop.replace('?api_key=' + apiKey, '?api_key=xxxxxxxxxxxxxxxx' + apiKey.slice(-1 * (apiKey.length - 26))));
  response = UrlFetchApp.fetch(urlDesktop, { 'muteHttpExceptions': true });
  console.log('Response', response);

  result.desktop = JSON.parse(response);

  var urlMobile = [
    'https://api.similarweb.com/v2/website/',
    domain,
    '/mobile-web/visits-full',
    '?api_key=', apiKey,
    '&country=', country,
    '&main_domain_only=false',
    '&show_verified=false'
  ].join('');

  console.log('Fetching', urlMobile.replace('?api_key=' + apiKey, '?api_key=xxxxxxxxxxxxxxxx' + apiKey.slice(-1 * (apiKey.length - 26))));
  response = UrlFetchApp.fetch(urlMobile, { 'muteHttpExceptions': true });
  console.log('Response', response);
  result.mobile = JSON.parse(response);

  return result;
}

function prepareSchema(request) {
  // Create schema for requested fields
  var fixedSchema = getSchema().schema;

  var dataSchema = request.fields.map(function (field) {
    for (var i = 0; i < fixedSchema.length; i++) {
      if (fixedSchema[i].name == field.name) {
        return fixedSchema[i];
      }
    }
  });

  return dataSchema;
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
