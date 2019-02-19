/* global CacheService, UrlFetchApp */

if (typeof(require) !== 'undefined') {
  var DataCache = require('./DataCache.js')['default'];
}

// eslint-disable-next-line no-unused-vars
function getAuthType(request) {
  var response = { type: 'NONE' };
  return response;
}

// eslint-disable-next-line no-unused-vars
function getConfig(request) {
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
        name: 'total_page_views',
        dataType: 'NUMBER',
        semantics: {
          conceptType: 'METRIC',
          semanticType: 'NUMBER',
          isReaggregatable: true
        },
        defaultAggregationType: 'SUM'
      },
      {
        name: 'total_visits_duration',
        dataType: 'NUMBER',
        semantics: {
          conceptType: 'METRIC',
          semanticType: 'NUMBER',
          isReaggregatable: true
        },
        defaultAggregationType: 'SUM'
      },
      {
        name: 'bounced_visits',
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
  var MAX_NB_DOMAINS = 10;
  var domains = request.configParams.domains.split(',').slice(0, MAX_NB_DOMAINS).map(function(x) {return x.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').replace(/\/.*$/i, '').toLowerCase();}),
    apiKey = request.configParams.apiKey,
    country = request.configParams.country,
    data = {};

  for (var i in domains) {
    var dom = domains[i];

    if (dom) {
      var cache = new DataCache(CacheService.getUserCache(), apiKey, dom, country);
      var domData = null;

      domData = fetchFromCache(cache);
      if (!domData) {
        domData = fetchFromAPI(dom, country, apiKey);
        setInCache(domData, cache);
      }
      data[dom] = domData;
      console.log('Data for ' + dom, JSON.stringify(domData).slice(0, 500));
    }
  }

  return buildTabularData(data, prepareSchema(request));
}

// eslint-disable-next-line no-unused-vars
function isAdminUser() {
  return true;
}

function buildTabularData(data, dataSchema) {
  var requestedData = [];
  console.log('Data Schema', dataSchema);
  Object.keys(data).forEach(function(dom) {
    // Desktop visits & engagement
    Object.keys(data[dom].desktop).forEach(function(date) {
      var dailyValues = data[dom].desktop[date];
      var values = [];
      dataSchema.forEach(function (field) {
        switch (field.name) {
        case 'visits':
          values.push(dailyValues.visits);
          break;
        case 'total_page_views':
          values.push(dailyValues.pages_per_visit * dailyValues.visits);
          break;
        case 'total_visits_duration':
          values.push(dailyValues.average_visit_duration * dailyValues.visits);
          break;
        case 'bounced_visits':
          values.push(dailyValues.bounce_rate * dailyValues.visits);
          break;
        case 'date':
          values.push(date.replace(/-/g, ''));
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

    // Mobile Web visits & engagement
    Object.keys(data[dom].mobile).forEach(function(date) {
      var dailyValues = data[dom].mobile[date];
      var values = [];
      dataSchema.forEach(function (field) {
        switch (field.name) {
        case 'visits':
          values.push(dailyValues.visits);
          break;
        case 'total_page_views':
          values.push(dailyValues.pages_per_visit * dailyValues.visits);
          break;
        case 'total_visits_duration':
          values.push(dailyValues.average_visit_duration * dailyValues.visits);
          break;
        case 'bounced_visits':
          values.push(dailyValues.bounce_rate * dailyValues.visits);
          break;
        case 'date':
          values.push(date.replace(/-/g, ''));
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
  });

  console.log('requested data', requestedData.slice(0, 3));
  return {
    schema: dataSchema,
    rows: requestedData
  };
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

  var desktopPagesPerVisit = httpGet('https://api.similarweb.com/v1/website/' + domain + '/traffic-and-engagement/pages-per-visit-full', params);
  if (desktopPagesPerVisit && desktopPagesPerVisit.pages_per_visit) {
    desktopPagesPerVisit.pages_per_visit.forEach(function(day) {
      var date = day.date;
      if (result.desktop.hasOwnProperty(date)) {
        result.desktop[date].pages_per_visit = day.pages_per_visit;
      }
    });
  }

  var desktopAvgVisitDuration = httpGet('https://api.similarweb.com/v1/website/' + domain + '/traffic-and-engagement/average-visit-duration-full', params);
  if (desktopAvgVisitDuration && desktopAvgVisitDuration.average_visit_duration) {
    desktopAvgVisitDuration.average_visit_duration.forEach(function(day) {
      var date = day.date;
      if (result.desktop.hasOwnProperty(date)) {
        result.desktop[date].average_visit_duration = day.average_visit_duration;
      }
    });
  }

  var desktopBounceRate = httpGet('https://api.similarweb.com/v1/website/' + domain + '/traffic-and-engagement/bounce-rate-full', params);
  if (desktopBounceRate && desktopBounceRate.bounce_rate) {
    desktopBounceRate.bounce_rate.forEach(function(day) {
      var date = day.date;
      if (result.desktop.hasOwnProperty(date)) {
        result.desktop[date].bounce_rate = day.bounce_rate;
      }
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
  var mobilePagesPerVisit = httpGet('https://api.similarweb.com/v2/website/' + domain + '/mobile-web/pages-per-visit-full', params);
  if (mobilePagesPerVisit && mobilePagesPerVisit.pages_per_visit) {
    mobilePagesPerVisit.pages_per_visit.forEach(function(day) {
      var date = day.date;
      if (result.desktop.hasOwnProperty(date)) {
        result.desktop[date].pages_per_visit = day.pages_per_visit;
      }
    });
  }

  var mobileAvgVisitDuration = httpGet('https://api.similarweb.com/v2/website/' + domain + '/mobile-web/average-visit-duration-full', params);
  if (mobileAvgVisitDuration && mobileAvgVisitDuration.average_visit_duration) {
    mobileAvgVisitDuration.average_visit_duration.forEach(function(day) {
      var date = day.date;
      if (result.desktop.hasOwnProperty(date)) {
        result.desktop[date].average_visit_duration = day.average_visit_duration;
      }
    });
  }

  var mobileBounceRate = httpGet('https://api.similarweb.com/v2/website/' + domain + '/mobile-web/bounce-rate-full', params);
  if (mobileBounceRate && mobileBounceRate.bounce_rate) {
    mobileBounceRate.bounce_rate.forEach(function(day) {
      var date = day.date;
      if (result.desktop.hasOwnProperty(date)) {
        result.desktop[date].bounce_rate = day.bounce_rate;
      }
    });
  }

  return result;
}

function prepareSchema(request) {
  // Create schema for requested fields
  var fixedSchema = getSchema().schema;
  console.log('fixed schema', JSON.stringify(fixedSchema));
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
