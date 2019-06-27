import { CapabilitiesReply } from './types/similarweb-api';
import { buildUrl, cleanDomain, httpGet, retrieveOrGet, retrieveOrGetAll, dateToYearMonth, UrlDataMap, Set } from './utils';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getAuthType(): object {
  const cc = DataStudioApp.createCommunityConnector();

  return cc.newAuthTypeResponse()
    .setAuthType(cc.AuthType.KEY)
    .setHelpUrl('https://account.similarweb.com/#/api-management')
    .build();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resetAuth(): void {
  const userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty('dscc.similarwebapi.key');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isAuthValid(): boolean {
  const userProperties = PropertiesService.getUserProperties();
  const key = userProperties.getProperty('dscc.similarwebapi.key');

  let data = null;

  if (key) {
    const response = UrlFetchApp.fetch('https://api.similarweb.com/capabilities?api_key=' + key, { muteHttpExceptions: true });
    data = JSON.parse(response.getContentText()) as CapabilitiesReply;
  }

  return (data && data.hasOwnProperty('remaining_hits'));
}

// TODO: look for a proper way to implement this function
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isAdminUser(): boolean {
  const adminUsersWhitelist = [
    'gregory.fryns@similarweb.com',
    'gregory.fryns@gmail.com'
  ];
  const email = Session.getEffectiveUser().getEmail();

  return adminUsersWhitelist.indexOf(email) > -1;
}

/**
 * Checks if the submitted key is valid
 * @param key The Similarweb API key to be checked
 * @return True if the key is valid, false otherwise
 */
function checkForValidKey(key: string): boolean {
  // Check key format
  if (!key.match(/[0-9a-f]{32}/i)) {
    return false;
  }

  // Check if key is valid
  const data = httpGet(buildUrl('https://api.similarweb.com/capabilities', { 'api_key': key }));

  return (data && data.hasOwnProperty('remaining_hits'));
}

/**
 * Sets the credentials.
 * @param request The set credentials request.
 * @return An object with an errorCode.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setCredentials(request): object {
  const key = request.key.trim().toLowerCase();

  const isValid = checkForValidKey(key);
  if (!isValid) {
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
  const userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty('dscc.similarwebapi.key', key);

  return {
    errorCode: 'NONE'
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/camelcase
function getConfig(): GoogleAppsScript.Data_Studio.Config {
  const cc = DataStudioApp.createCommunityConnector();
  const config = cc.getConfig();

  config.newInfo()
    .setId('instructions')
    .setText('You can find your SimilarWeb API key or create a new one here (a SimilarWeb Pro account is needed): https://account.similarweb.com/#/api-management');

  config.newTextInput()
    .setId('domains')
    .setName('Domains')
    .setHelpText('Enter the name of up to 25 domains you would like to analyze, separated by commas (e.g. cnn.com, foxnews.com, washingtonpost.com, nytimes.com)')
    .setPlaceholder('e.g.: cnn.com, foxnews.com, washingtonpost.com, nytimes.com')
    .setAllowOverride(true);

  config.newTextInput()
    .setId('country')
    .setName('Country Code')
    .setHelpText('ISO 2-letter country code of the country (e.g. us, gb - world for Worldwide)')
    .setPlaceholder('e.g.: us')
    .setAllowOverride(true);

  return config.build();
}

// eslint-disable-next-line @typescript-eslint/camelcase
function getConnectorFields(): GoogleAppsScript.Data_Studio.Fields {
  const cc = DataStudioApp.createCommunityConnector();
  const fields = cc.getFields();
  const types = cc.FieldType;
  const aggregations = cc.AggregationType;

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getSchema(request): object {
  const fields = getConnectorFields().build();
  return { schema: fields };
}

enum EndpointType {
  WebDesktopData = 'web_desktop_data',
  WebMobileData = 'web_mobile_data',
  AppData = 'app_data',
  AppEngagmentData = 'app_engagement_data'
}

class ApiConfiguration {
  private static capData: CapabilitiesReply;
  private static apiKey: string;
  private static instance: ApiConfiguration;

  private constructor() {
  }

  public static getInstance(): ApiConfiguration {
    if (!ApiConfiguration.instance) {
      ApiConfiguration.instance = new ApiConfiguration();
    }

    return ApiConfiguration.instance;
  }

  public setApiKey(apiKey: string): void {
    ApiConfiguration.apiKey = apiKey;
    ApiConfiguration.capData = retrieveOrGet('https://api.similarweb.com/capabilities', { 'api_key': apiKey }) as CapabilitiesReply;
  }

  public hasApiKey(): boolean {
    return !!ApiConfiguration.apiKey;
  }

  /**
   * Returns the default parameters for the API request, including the start and
   * end dates, based on the API key access rights. Returns null country is not available.
   * @param endpointType Type of the endpoint you want to get the parameters for
   * @param country 2-letter ISO country code, or 'world' for Worldwide
   */
  public getDefaultParams(endpointType: EndpointType, country: string): object {
    const capData = ApiConfiguration.capData;
    const params = {
      'api_key': ApiConfiguration.apiKey,
      'country': country,
      'granularity': 'monthly',
      'main_domain_only': 'false',
      'show_verified': 'false'
    };
    if (!capData.hasOwnProperty(endpointType)) {
      console.log('capabilities - ', JSON.stringify(capData));
      DataStudioApp.createCommunityConnector()
        .newUserError()
        .setDebugText(`Invalid Endpoint Type : ${endpointType}`)
        .setText(`An error has occurred, please contact the developers to fix the problem.`)
        .throwException();
    }

    // Check if the country is available for the selected API key
    if (capData[endpointType].countries.some((c): boolean => c.code.toLowerCase() === country)) {
      params['start_date'] = dateToYearMonth(capData.web_desktop_data.snapshot_interval.start_date);
      params['end_date'] = dateToYearMonth(capData.web_desktop_data.snapshot_interval.end_date);
    }
    else {
      return null;
    }

    return params;
  }
}

// eslint-disable-next-line @typescript-eslint/camelcase
function gatherUrls(requestedFields: GoogleAppsScript.Data_Studio.Fields, domains: string[], country: string): string[] {
  const userProperties = PropertiesService.getUserProperties();
  const apiKey = userProperties.getProperty('dscc.similarwebapi.key');
  const configurator = ApiConfiguration.getInstance();
  configurator.setApiKey(apiKey);

  const desktopParams = configurator.getDefaultParams(EndpointType.WebDesktopData, country);
  const mobileParams = configurator.getDefaultParams(EndpointType.WebMobileData, country);

  const urls = new Set();
  requestedFields.asArray().forEach((field): void => {
    switch (field.getId()) {
      case 'visits':
        domains.forEach((dom: string): void => {
          urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/traffic-and-engagement/visits`, desktopParams));
          if (mobileParams) {
            urls.add(buildUrl(`https://api.similarweb.com/v2/website/${ dom }/mobile-web/visits`, mobileParams));
          }
        });
        break;
      case 'page_views':
        domains.forEach((dom: string): void => {
          urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/traffic-and-engagement/visits`, desktopParams));
          urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/traffic-and-engagement/pages-per-visit`, desktopParams));
          if (mobileParams) {
            urls.add(buildUrl(`https://api.similarweb.com/v2/website/${ dom }/mobile-web/visits`, mobileParams));
            urls.add(buildUrl(`https://api.similarweb.com/v2/website/${ dom }/mobile-web/pages-per-visit`, mobileParams));
          }
        });
        break;
      case 'visits_duration':
        domains.forEach((dom: string): void => {
          urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/traffic-and-engagement/visits`, desktopParams));
          urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/traffic-and-engagement/average-visit-duration`, desktopParams));
          if (mobileParams) {
            urls.add(buildUrl(`https://api.similarweb.com/v2/website/${ dom }/mobile-web/visits`, mobileParams));
            urls.add(buildUrl(`https://api.similarweb.com/v2/website/${ dom }/mobile-web/average-visit-duration`, mobileParams));
          }
        });
        break;
      case 'bounced_visits':
        domains.forEach((dom: string): void => {
          urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/traffic-and-engagement/visits`, desktopParams));
          urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/traffic-and-engagement/bounce-rate`, desktopParams));
          if (mobileParams) {
            urls.add(buildUrl(`https://api.similarweb.com/v2/website/${ dom }/mobile-web/visits`, mobileParams));
            urls.add(buildUrl(`https://api.similarweb.com/v2/website/${ dom }/mobile-web/bounce-rate`, mobileParams));
          }
        });
        break;
      case 'unique_visitors':
        domains.forEach((dom: string): void => {
          urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/unique-visitors/desktop_mau`, desktopParams));
          if (mobileParams) {
            urls.add(buildUrl(`https://api.similarweb.com/v1/website/${ dom }/unique-visitors/mobileweb_mau`, mobileParams));
          }
        });
        break;
    }
  });

  return urls.getValues();
}

function prepareData(responses: UrlDataMap): object {
  const results = {};
  const endpointMetrics = {
    'visits': 'visits',
    'average-visit-duration': 'average_visit_duration',
    'pages-per-visit': 'pages_per_visit',
    'bounce-rate': 'bounce_rate',
    'desktop_mau': 'unique_visitors',
    'mobileweb_mau': 'unique_visitors'
  };

  const reUrl = /https:\/\/api\.similarweb\.com\/v\d\/website\/([^/]+)\/([^/]+)\/([^/]+)\?.*/i;
  Object.keys(responses).forEach((url: string): void => {
    const data = responses[url];
    const match = reUrl.exec(url);
    if (match && data && data.meta && data.meta.status === 'Success') {
      const dom = match[1];
      const device = match[2] === 'mobile-web' ? 'Mobile Web' : 'Desktop';
      const endpoint = match[3];
      const metric = endpointMetrics[endpoint];
      if (!results.hasOwnProperty(dom)) {
        results[dom] = { 'Desktop': {}, 'Mobile Web': {} };
      }
      const deviceResult = results[dom][device];
      data[metric].forEach((monthlyValue): void => {
        const date = monthlyValue.date;
        if (!deviceResult.hasOwnProperty(date)) {
          deviceResult[date] = {};
        }
        deviceResult[date][metric] = monthlyValue[metric];
      });
    }
  });

  return results;
}
// eslint-disable-next-line @typescript-eslint/camelcase, @typescript-eslint/no-explicit-any
function buildTabularData(requestedFields: GoogleAppsScript.Data_Studio.Fields, preparedData: object): any[][] {
  const requestedData = [];
  Object.keys(preparedData).forEach((dom): void => {
    Object.keys(preparedData[dom]).forEach((device): void => {
      Object.keys(preparedData[dom][device]).forEach((date): void => {
        const values = preparedData[dom][device][date];
        const row = [];
        requestedFields.asArray().forEach((field): void => {
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
              row.push(device);
              break;
            default:
              row.push('');
          }
        });

        requestedData.push({ 'values': row });
      });
    });
  });

  return requestedData;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getData(request): object {
  const MAX_NB_DOMAINS = 25;

  const country = request.configParams.country.trim().toLowerCase() as string;
  const domains = request.configParams.domains.split(',').slice(0, MAX_NB_DOMAINS).map(cleanDomain) as string[];

  const requestedFieldIDs = request.fields.map((field): string => field.name);

  console.log('requested fields ids', JSON.stringify(requestedFieldIDs));
  const requestedFields = getConnectorFields().forIds(requestedFieldIDs);

  const urls = gatherUrls(requestedFields, domains, country);
  const responses = retrieveOrGetAll(urls);
  const preparedData = prepareData(responses);
  const tabularData = buildTabularData(requestedFields, preparedData);

  return {
    schema: requestedFields.build(),
    rows: tabularData
  };
}
