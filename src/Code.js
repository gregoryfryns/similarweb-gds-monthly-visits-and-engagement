/* global DataStudioApp, Session, PropertiesService */

if (typeof(require) !== 'undefined') {
  var [httpGet, retrieveOrGet, retrieveOrGetAll, dateToYearMonth, buildUrl, cleanDomain] = require('./utils.js')['httpGet', 'retrieveOrGet', 'retrieveOrGetAll', 'dateToYearMonth', 'buildUrl', 'cleanDomain'];
}

// eslint-disable-next-line no-unused-vars
function getAuthType() {
  var cc = DataStudioApp.createCommunityConnector();
  return cc.newAuthTypeResponse()
    .setAuthType(cc.AuthType.KEY)
    .setHelpUrl('https://account.similarweb.com/#/api-management')
    .build();
}

// eslint-disable-next-line no-unused-vars
function resetAuth() {
  var userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty('dscc.similarwebapi.key');
}

// eslint-disable-next-line no-unused-vars
function isAuthValid() {
  var userProperties = PropertiesService.getUserProperties();
  var key = userProperties.getProperty('dscc.similarwebapi.key');

  var data = httpGet('https://api.similarweb.com/capabilities', { api_key: key });

  return (data && data.hasOwnProperty('remaining_hits'));
}

// TODO: look for a proper way to implement this function
// eslint-disable-next-line no-unused-vars
function isAdminUser() {
  var adminUsersWhitelist = [
    'gregory.fryns@similarweb.com',
    'gregory.fryns@gmail.com'
  ];
  var email = Session.getEffectiveUser().getEmail();
  return adminUsersWhitelist.indexOf(email) > -1;
}

/**
 * Checks if the submitted key is valid
 * @param {Request} key The Similarweb API key to be checked
 * @return {boolean} True if the key is valid, false otherwise
 */
function checkForValidKey(key) {
  // Check key format
  if (!key.match(/[0-9a-f]{32}/i)) {
    return false;
  }

  // Check if key is valid
  var data = httpGet('https://api.similarweb.com/capabilities', { api_key: key });

  return (data && data.hasOwnProperty('remaining_hits'));
}

/**
 * Sets the credentials.
 * @param {Request} request The set credentials request.
 * @return {object} An object with an errorCode.
 */
// eslint-disable-next-line no-unused-vars
function setCredentials(request) {
  var key = request.key.trim().toLowerCase();

  var validKey = checkForValidKey(key);
  if (!validKey) {
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
  var userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty('dscc.similarwebapi.key', key);

  return {
    errorCode: 'NONE'
  };
}

// eslint-disable-next-line no-unused-vars
function getConfig() {
  var cc = DataStudioApp.createCommunityConnector();
  var config = cc.getConfig();

  config.newInfo()
    .setId('instructions')
    .setText('You can find your SimilarWeb API key or create a new one here (a SimilarWeb Pro account is needed): https://account.similarweb.com/#/api-management');

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
  var aggregations = cc.AggregationType;

  fields.newDimension()
    .setId('date')
    .setName('Date')
    .setType(types.YEAR_MONTH_DAY);

  fields.newDimension()
    .setId('year_month')
    .setName('Date (Year & Month)')
    .setType(types.YEAR_MONTH);

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
    .setType(types.NUMBER)
    .setIsReaggregatable(true)
    .setAggregation(aggregations.SUM);

  fields.newMetric()
    .setId('page_views')
    .setName('Total Page Views')
    .setDescription('SimilarWeb estimated number of pages views')
    .setType(types.NUMBER)
    .setIsReaggregatable(true)
    .setAggregation(aggregations.SUM)
    .setIsHidden(true);

  fields.newMetric()
    .setId('ppv')
    .setName('Pages per Visit')
    .setDescription('Average number of pages visited per session')
    .setType(types.NUMBER)
    .setIsReaggregatable(false)
    .setFormula('sum($page_views)/sum($visits)');

  fields.newMetric()
    .setId('visits_duration')
    .setName('Total Visits Duration')
    .setDescription('SimilarWeb estimated amount of time spent on domain')
    .setType(types.NUMBER)
    .setIsReaggregatable(true)
    .setAggregation(aggregations.SUM)
    .setIsHidden(true);

  fields.newMetric()
    .setId('avg_visit_duration')
    .setName('Avg. Visit Duration')
    .setDescription('Average time spent per visit, in seconds')
    .setType(types.DURATION)
    .setIsReaggregatable(false)
    .setFormula('sum($visits_duration)/sum($visits)');

  fields.newMetric()
    .setId('bounced_visits')
    .setName('Bounced Visits')
    .setDescription('SimilarWeb estimated number of bounced visits')
    .setType(types.NUMBER)
    .setIsReaggregatable(true)
    .setAggregation(aggregations.SUM)
    .setIsHidden(true);

  fields.newMetric()
    .setId('bounce_rate')
    .setName('Bounce rate')
    .setDescription('Rate of visits for which no other interaction has been detected 30 minutes after the user first accessed the page')
    .setType(types.PERCENT)
    .setIsReaggregatable(false)
    .setFormula('sum($bounced_visits)/sum($visits)');

  fields.newMetric()
    .setId('unique_visitors')
    .setName('Monthly Unique Visitors')
    .setDescription('Amount of unique users that visited the domain within a month')
    .setType(types.NUMBER)
    .setIsReaggregatable(true)
    .setAggregation(aggregations.AVG);

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

  var userProperties = PropertiesService.getUserProperties();
  var apiKey = userProperties.getProperty('dscc.similarwebapi.key');

  var country = request.configParams.country.trim().toLowerCase();
  var domains = request.configParams.domains.split(',').slice(0, MAX_NB_DOMAINS).map(cleanDomain);

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

  var data = collectData(domains, apiKey, country, endpoints);

  return {
    schema: requestedFields.build(),
    rows: buildTabularData(requestedFields, data)
  };
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
    case 'year_month':
      row.push(date.split('-').slice(0, 2).join(''));
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
 * @param {object} endpoints - Endpoint details (url, object name, device type & isRequired boolean)
 * @param {string} domains - list of domains for which to pull the data
 * @param {object} params - object containing the parameters for desktop & mobile HTTP calls
 * @return {object} - Results
 */
function collectData(domains, apiKey, country, endpoints) {
  var requiredEndpoints = Object.keys(endpoints).map(function(ep) { return endpoints[ep]; })
    .filter(function(ep) { return ep.isRequired; });

  var apiRequests = [];

  var defaultParams = generateApiParams(apiKey, country);
  domains.forEach(function(dom) {
    requiredEndpoints.forEach(function(ep) {
      var params = defaultParams[ep.device];
      if (params) {
        params['domain'] = dom;
        apiRequests.push({ url: buildUrl(ep.url, params), domain: dom, device: ep.device, objectName: ep.objectName });
      }
    });
  });

  var apiReplies = retrieveOrGetAll(apiRequests.map(function(req) { return req.url; }));

  var results = {};
  apiReplies.forEach(function(data, i) {
    var req = apiRequests[i];
    var dom = req.domain;
    var device = req.device;
    if (data && data[req.objectName]) {
      if (!results.hasOwnProperty(dom)) {
        results[dom] = {};
      }
      if (!results[dom].hasOwnProperty(device)) {
        results[dom][device] = {};
      }
      var deviceResult = results[dom][device];
      data[req.objectName].forEach(function(monthlyValues) {
        var date = monthlyValues.date;
        if (!deviceResult.hasOwnProperty(date)) {
          deviceResult[date] = {};
        }
        deviceResult[date][req.objectName] = monthlyValues[req.objectName];
      });
    }
  });

  return results;
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
      params.desktop['start_date'] = dateToYearMonth(capData.web_desktop_data.snapshot_interval.start_date);
      params.desktop['end_date'] = dateToYearMonth(capData.web_desktop_data.snapshot_interval.end_date);
    }

    // If the selected country is available for that API key (mobile web)
    if (capData.web_mobile_data.countries.some(function(c) {return c.code.toLowerCase() == country;})) {
      params.mobile = JSON.parse(JSON.stringify(paramsCommon)); // clone paramsCommon object
      params.mobile['start_date'] = dateToYearMonth(capData.web_mobile_data.snapshot_interval.start_date);
      params.mobile['end_date'] = dateToYearMonth(capData.web_mobile_data.snapshot_interval.end_date);
    }
  }

  return params;
}
