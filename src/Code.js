/* global CacheService, UrlFetchApp, DataStudioApp, Session */

if (typeof(require) !== 'undefined') {
  var DataCache = require('./DataCache.js')['default'];
}

// eslint-disable-next-line no-unused-vars
function getAuthType(request) {
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
function getConnectorFields() {
  var cc = DataStudioApp.createCommunityConnector();
  var fields = cc.getFields();
  var types = cc.FieldType;
  // var aggregations = cc.AggregationType;

  fields.newDimension()
    .setId('date')
    .setName('Date')
    .setType(types.YEAR_MONTH_DAY);

  fields.newDimension()
    .setId('domain')
    .setName('Domain')
    .setGroup('Dimensions')
    .setType(types.TEXT);

  fields.newDimension()
    .setId('device')
    .setName('Device')
    .setGroup('Dimensions')
    .setDescription('Device type: Desktop or Mobile Web')
    .setType(types.TEXT);

  fields.newMetric()
    .setId('visits')
    .setName('Visits')
    .setDescription('SimilarWeb estimated number of visits')
    .setType(types.NUMBER);

  fields.newMetric()
    .setId('page_views')
    .setName('Total Page Views')
    .setDescription('SimilarWeb estimated number of pages views')
    .setType(types.NUMBER)
    .setIsHidden(true);

  fields.newMetric()
    .setId('ppv')
    .setName('Pages per Visit')
    .setDescription('Average number of pages visited per session')
    .setType(types.NUMBER)
    .setFormula('sum($page_views)/sum($visits)');

  fields.newMetric()
    .setId('visits_duration')
    .setName('Total Visits Duration')
    .setDescription('SimilarWeb estimated amount of time spent on domain')
    .setType(types.NUMBER)
    .setIsHidden(true);

  fields.newMetric()
    .setId('avg_visit_duration')
    .setName('Avg. Visit Duration')
    .setDescription('Average time spent per visit, in seconds')
    .setType(types.DURATION)
    .setFormula('sum($visits_duration)/sum($visits)');

  fields.newMetric()
    .setId('bounced_visits')
    .setName('Bounced Visits')
    .setDescription('SimilarWeb estimated number of bounced visits')
    .setType(types.NUMBER)
    .setIsHidden(true);

  fields.newMetric()
    .setId('bounce_rate')
    .setName('Bounce rate')
    .setDescription('Rate of visits for which no other interaction has been detected 30 minutes after the user first accessed the page')
    .setType(types.PERCENT)
    .setFormula('sum($bounced_visits)/sum($visits)');

  fields.newMetric()
    .setId('unique_visitors')
    .setName('Monthly Unique Visitors')
    .setDescription('Amount of unique users that visited the domain within a month')
    .setType(types.NUMBER);

  fields.setDefaultDimension('domain');
  fields.setDefaultMetric('visits');

  return fields;
}

// eslint-disable-next-line no-unused-vars
function getSchema(request) {
  var fields = getConnectorFields().build();
  return { schema: fields };
}

// eslint-disable-next-line no-unused-vars
function getData(request) {
  var MAX_NB_DOMAINS = 10;
  var country = request.configParams.country.trim().toLowerCase();
  var apiKey = request.configParams.apiKey.trim().toLowerCase();
  var domains = request.configParams.domains.split(',').slice(0, MAX_NB_DOMAINS).map(function(domain) {
    return domain.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').replace(/\/.*$/i, '').toLowerCase();
  });

  var requestedFieldIDs = request.fields.map(function(field) {
    return field.name;
  });
  console.log('requested fields ids', JSON.stringify(requestedFieldIDs));
  var requestedFields = getConnectorFields().forIds(requestedFieldIDs);

  // Prepare data to be fetched
  var endpoints = {
    desktopVisits: {
      url: 'https://api.similarweb.com/v1/website/xxx/traffic-and-engagement/visits',
      objectName: 'visits',
      device: 'desktop',
      isRequired: false
    },
    mobileVisits: {
      url: 'https://api.similarweb.com/v2/website/xxx/mobile-web/visits',
      objectName: 'visits',
      device: 'mobile',
      isRequired: false
    },
    desktopPagesPerVisit: {
      url: 'https://api.similarweb.com/v1/website/xxx/traffic-and-engagement/pages-per-visit',
      objectName: 'pages_per_visit',
      device: 'desktop',
      isRequired: false
    },
    mobilePagesPerVisit: {
      url: 'https://api.similarweb.com/v2/website/xxx/mobile-web/pages-per-visit',
      objectName: 'pages_per_visit',
      device: 'mobile',
      isRequired: false
    },
    desktopAvgVisitDuration: {
      url: 'https://api.similarweb.com/v1/website/xxx/traffic-and-engagement/average-visit-duration',
      objectName: 'average_visit_duration',
      device: 'desktop',
      isRequired: false
    },
    mobileAvgVisitDuration: {
      url: 'https://api.similarweb.com/v2/website/xxx/mobile-web/average-visit-duration',
      objectName: 'average_visit_duration',
      device: 'mobile',
      isRequired: false
    },
    desktopBounceRate: {
      url: 'https://api.similarweb.com/v1/website/xxx/traffic-and-engagement/bounce-rate',
      objectName: 'bounce_rate',
      device: 'desktop',
      isRequired: false
    },
    mobileBounceRate: {
      url: 'https://api.similarweb.com/v2/website/xxx/mobile-web/bounce-rate',
      objectName: 'bounce_rate',
      device: 'mobile',
      isRequired: false
    },
    desktopUniqueVisitors: {
      url: 'https://api.similarweb.com/v1/website/xxx/unique-visitors/desktop_mau',
      objectName: 'unique_visitors',
      device: 'desktop',
      isRequired: false
    },
    mobileUniqueVisitors: {
      url: 'https://api.similarweb.com/v1/website/xxx/unique-visitors/mobileweb_mau',
      objectName: 'unique_visitors',
      device: 'mobile',
      isRequired: false
    }
  };

  requestedFields.asArray().forEach(function (field) {
    switch (field.getId()) {
    case 'visits':
      endpoints.desktopVisits.isRequired = true;
      endpoints.mobileVisits.isRequired = true;
      break;
    case 'page_views':
      endpoints.desktopVisits.isRequired = true;
      endpoints.desktopPagesPerVisit.isRequired = true;
      endpoints.mobileVisits.isRequired = true;
      endpoints.mobilePagesPerVisit.isRequired = true;
      break;
    case 'visits_duration':
      endpoints.desktopVisits.isRequired = true;
      endpoints.desktopAvgVisitDuration.isRequired = true;
      endpoints.mobileVisits.isRequired = true;
      endpoints.mobileAvgVisitDuration.isRequired = true;
      break;
    case 'bounced_visits':
      endpoints.desktopVisits.isRequired = true;
      endpoints.desktopBounceRate.isRequired = true;
      endpoints.mobileVisits.isRequired = true;
      endpoints.mobileBounceRate.isRequired = true;
      break;
    case 'unique_visitors':
      endpoints.desktopUniqueVisitors.isRequired = true;
      endpoints.mobileUniqueVisitors.isRequired = true;
    }
  });

  var data = {};
  var params = generateApiParams(apiKey, country);

  domains.forEach(function(domain) {
    if (params.desktop) {
      params.desktop['domain'] = domain;
    }
    if (params.mobile) {
      params.mobile['domain'] = domain;
    }
    data[domain] = collectData(endpoints, params);
  });

  return {
    schema: requestedFields.build(),
    rows: buildTabularData(requestedFields, data)
  };
}

// eslint-disable-next-line no-unused-vars
function isAdminUser() {
  var adminUsersWhitelist = [
    'gregory.fryns@similarweb.com',
    'gregory.fryns@gmail.com'
  ];
  var email = Session.getEffectiveUser().getEmail();
  return adminUsersWhitelist.indexOf(email) > -1;
}

// eslint-disable-next-line no-unused-vars
function throwError (message, userSafe) {
  if (userSafe) {
    message = 'DS_USER:' + message;
  }
  throw new Error(message);
}

function buildTabularData(requestedFields, data) {
  var requestedData = [];

  Object.keys(data).forEach(function(dom) {
    var desktopData = data[dom].desktop;
    Object.keys(desktopData).forEach(function(date) {
      var values = desktopData[date];
      var row = buildRow(date, dom, 'Desktop', requestedFields, values);

      requestedData.push({ values: row });
    });

    var mobileData = data[dom].mobile;
    Object.keys(mobileData).forEach(function(date) {
      var values = mobileData[date];
      var row = buildRow(date, dom, 'Mobile Web', requestedFields, values);

      requestedData.push({ values: row });
    });
  });

  return requestedData;
}

function buildRow(date, dom, deviceName, requestedFields, values) {
  var row = [];
  requestedFields.asArray().forEach(function (field) {
    switch (field.getId()) {
    case 'visits':
      row.push(values.visits);
      break;
    case 'page_views':
      row.push(values.visits * values.pages_per_visit);
      break;
    case 'visits_duration':
      row.push(values.visits * values.average_visit_duration);
      break;
    case 'bounced_visits':
      row.push(values.visits * values.bounce_rate);
      break;
    case 'unique_visitors':
      row.push(values.unique_visitors);
      break;
    case 'date':
      row.push(date.split('-').slice(0, 3).join(''));
      break;
    case 'domain':
      row.push(dom);
      break;
    case 'device':
      row.push(deviceName);
      break;
    default:
      row.push('');
    }
  });

  return row;
}
/**
 * Creates an object with the results for the required endpoints
 *
 * @param {Set} endpoints - set of objects with endpoint details (url, object name, device type & isRequired boolean)
 * @param {string} domain - domain name
 * @param {string} country - country code
 * @param {string} apiKey - SimilarWeb API key
 * @return {object} - Results
 */
function collectData(endpoints, params) {
  var result = { desktop: {}, mobile: {} };

  Object.keys(endpoints).forEach(function(epName) {
    var ep = endpoints[epName];
    // Retrieve data from cache or API
    if (ep.isRequired && params[ep.device]) {
      var data = retrieveOrGet(ep.url, params[ep.device]);
      if (data && data[ep.objectName]) {
        data[ep.objectName].forEach(function(monthlyValues) {
          var date = monthlyValues.date;

          var deviceResult = result[ep.device];
          if (!deviceResult.hasOwnProperty(date)) {
            deviceResult[date] = {};
          }
          deviceResult[date][ep.objectName] = monthlyValues[ep.objectName];
        });
      }
    }
  });

  return result;
}

/**
 * Tries to retrieve the requested data in the cache, and calls the API if not successful
 *
 * @param {string} url - url to the desired API endpoint
 * @param {?object} params - object that contains the URL parameters and their values
 * @return {object} - Results, or null if the API call wasn't successful
 */
function retrieveOrGet(url, params) {
  if (typeof params === 'undefined') { params = {}; }

  var cache = new DataCache(CacheService.getUserCache(), url, params);
  var data;

  try {
    var dataString = cache.get();
    data = JSON.parse(dataString);
    console.log('Fetched succesfully from cache', cache.cacheKey);
  }
  catch (e) {
    console.log('Error when fetching from cache:', cache.cacheKey, e);
  }

  if (!data) {
    data = httpGet(url, params);
    if (data) {
      try {
        cache.set(JSON.stringify(data));
      }
      catch (e) {
        console.log('Error when storing in cache', cache.cacheKey, e);
      }
    }
  }

  return data;
}

/**
 * Send a HTTP GET request to an API endpoint and return the results in a JavaScript object
 *
 * @param {String} url - url to the desired API endpoint
 * @param {object} params - object that contains the URL parameters and their values
 * @return {object} Results returned by the API, or null if the API call wasn't successful
 */
function httpGet(url, params) {
  var urlParams = Object.keys(params).map(function(k) {return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  var fullUrl = url + (urlParams.length > 0 ? '?' + urlParams : '');

  console.log('Fetching', fullUrl.replace(/api_key=[0-9a-f]{26}/gi, 'api_key=xxxxxxxxxxx'));
  var response = UrlFetchApp.fetch(fullUrl, { 'muteHttpExceptions': true });
  console.log('Response', response);

  var data = JSON.parse(response);

  return data;
}

/**
 * Generate an object with 2 objects containing the API parameters to be used for the SW desktop
 * and mobile web API requests respectively
 *
 * @param {string} apiKey - SimilarWeb API Key
 * @param {string} country - 2-letter ISO country code of the desired country or 'world' for Worldwide
 * @param {?string} domain - desired domain
 * @return {object} - Object containing two objects: desktop & mobile with the API parameters to specific
 *   to desktop and mobile web requests respectively
 */
function generateApiParams(apiKey, country, domain) {
  var capData = retrieveOrGet('https://api.similarweb.com/capabilities', { api_key: apiKey });
  var params = { desktop: null, mobile: null };

  if (capData && capData.remaining_hits && capData.web_desktop_data && capData.web_mobile_data) {
    var paramsCommon = {
      api_key: apiKey,
      country: country,
      domain: domain,
      granularity: 'monthly',
      main_domain_only: 'false',
      show_verified: 'false'
    };
    if (domain !== undefined) {
      paramsCommon['domain'] = domain;
    }

    // If the selected country is available for that API key (desktop)
    if (capData.web_desktop_data.countries.some(function(c) {return c.code.toLowerCase() == country;})) {
      params.desktop = JSON.parse(JSON.stringify(paramsCommon)); // clone paramsCommon object
      params.desktop['start_date'] = capData.web_desktop_data.snapshot_interval.start_date.split('-').slice(0, 2).join('-');
      params.desktop['end_date'] = capData.web_desktop_data.snapshot_interval.end_date.split('-').slice(0, 2).join('-');
    }

    // If the selected country is available for that API key (mobile web)
    if (capData.web_mobile_data.countries.some(function(c) {return c.code.toLowerCase() == country;})) {
      params.mobile = JSON.parse(JSON.stringify(paramsCommon)); // clone paramsCommon object
      params.mobile['start_date'] = capData.web_mobile_data.snapshot_interval.start_date.split('-').slice(0, 2).join('-');
      params.mobile['end_date'] = capData.web_mobile_data.snapshot_interval.end_date.split('-').slice(0, 2).join('-');
    }
  }

  return params;
}
