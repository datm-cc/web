(function(window) {
    var VERSION = '2.0';
  
    if (window.datm && window.datm.loaded) {
      return;
    }
  
    var tracker = {
      version: VERSION,
      account: null,
      subAccount: null,
      script: true,
      loaded: true,
      config: false,
      initialized: false,
      maxBeaconSize: 14336,
      serverDomain: null,
      baseUrl: null,
      useCookies: true,
      cookieDomain: null,
      sessionId: null,
      clientId: null,
      gaSessionId: null,
      gaClientId: null,
      sessionDuration: 30, // Duration in mins
      sessionExpiration: null,
      loggingEnabled: false,
      pageStorage: null,
      sessionStorage: null,
      pageEvents: null,
      sessionEvents: null,
      sessionIdCookie: 'datm_sid',
      clientIdCookie: 'datm_cid',
      sessionStorageCookie: 'datm_ss',
      sessionEventsCookie: 'datm_se',
      sessionHandled: null,
      eventIndex: 0,
      trackPageview: false,
      trackNewSession: false,
      commonParams: {},
      queue: [],
  
      push: function(data) {
        if (!data) return;
  
        var action = typeof data === 'string' ? data : data.action;
        this.sessionHandled = false;
  
        // Push request to queue if object not intialized
        if (!this.initialized && action !== 'initialize') {
          this.queue.push(data);
          this.log('Moved request to queue', request);
          return;
        }
  
        // Delete action param from data object
        if (data.action) {
          delete data.action;
        }
  
        // Initialize
        if (action === 'initialize') {
          this.initialize(data);
          return;
        }
  
        // Track
        if (action === 'track') {
          this.track(data);
          return;
        }
  
        // Engage
        if (action === 'engage') {
          this.handleSession();
          return;
        }
  
        // Set page param
        if (action === 'setPageParam') {
          this.setPageParam(data.name, data.value);
          return;
        }
  
        // Set session param
        if (action === 'setSessionParam') {
          this.setSessionParam(data.name, data.value);
          return;
        }
  
        this.log('Invalid action:', action);
      },
  
      initialize: function(config) {
        this.log('Initializing Datm object');
  
        // Set required config parameters
        var domain = config.serverDomain;
  
        if (!domain) {
          this.log("Can't initialize.  Domain not provided");
          return;
        }
  
        var serverPath = '/web';
        var versionPath = '/v' + VERSION.split('.')[0];
        this.serverDomain = domain;
        this.baseUrl = 'https://' + domain + serverPath + versionPath;
  
        // Set optional config parameters if defined
        this.account = config.account;
        this.subAccount = config.subAccount;
        this.sessionDuration = config.sessionDuration || this.sessionDuration;
        this.sessionIdCookie = config.sessionIdCookie || this.sessionIdCookie;
        this.clientIdCookie = config.clientIdCookie || this.clientIdCookie;
        this.sessionStorageCookie = config.sessionStorageCookie || this.sessionStorageCookie;
        this.sessionEventsCookie = config.sessionEventsCookie || this.sessionEventsCookie;
        this.commonParams = config.commonParams || this.commonParams;
        this.trackPageview = config.trackPageview || this.trackPageview;
        this.trackNewSession = config.trackNewSession || this.trackNewSession;
  
        this.useCookies = config.useCookies !== undefined ?
          config.useCookies :
          this.useCookies;
  
        this.loggingEnabled = config.loggingEnabled !== undefined ?
          config.loggingEnabled : this.loggingEnabled;
  
        // Set cookie params and session info
        if (this.useCookies === true) {
          this.setCookieDomain(config.cookieDomain);
          this.loadCookieData();
          this.gaSessionId = config.gaSessionId || this.gaSessionId;
          this.gaClientId = config.gaClientId || this.gaClientId;
        }
  
        // Mark as initialized
        this.initialized = true;
        this.log('Datm successfully initialized', this);
  
        // Set up session
        this.handleSession();
  
        // Add page view event to queue
        if (this.trackPageview) {
          this.track({event_name: 'page_view'});
        }
  
        // Process request queue
        while (this.queue.length > 0) {
          var request = this.queue.shift();
          this.log('Processing queue request', request);
          this.push(request);
        }
      },
  
      track: function(payload) {
        if (!this.initialized) {
          this.log('Datm object not initialized');
          return;
        }
  
        if (!payload || !payload.event_name) {
          this.log('No event defined');
          return;
        }
        
        // Extend or create new session
        this.handleSession();
  
        // Increment event count
        this.eventIndex++;
  
        // Set common event params
        this.mergeObjects(payload, this.commonParams);
  
        // Set tracker params
        payload.account = this.account;
        payload.sub_account = this.subAccount;
        payload.event_index = this.eventIndex;
  
        // Set page params
        payload.page = payload.page || {};
        payload.page.title = payload.page.title || document.title;
  
        if (payload.page.url) {
          var pageObj = this.createUrlObj(payload.page.url) || {};
          payload.page.domain = payload.page.domain || pageObj.hostname || document.location.hostname;
          payload.page.path = payload.page.path || pageObj.pathname || document.location.pathname;
          payload.page.search = payload.page.search || pageObj.search || document.location.search;
  
        }
        else {
          payload.page.url = document.location.href;
          payload.page.domain = payload.page.domain || document.location.hostname;
          payload.page.path = payload.page.path || document.location.pathname;
          payload.page.search = payload.page.search || document.location.search;
        }
        
        // Set query params
        var searchObj = this.createSearchObj(payload.page.search);
        
        payload.page.params = this.getSearchKeys(searchObj);
  
        payload.campaign = payload.campaign || {};
        payload.campaign.medium = payload.campaign.medium || this.getSearchValue(searchObj, 'utm_medium');
        payload.campaign.source = payload.campaign.source || this.getSearchValue(searchObj, 'utm_source');
        payload.campaign.name = payload.campaign.name || this.getSearchValue(searchObj, 'utm_campaign');
        payload.campaign.content = payload.campaign.content || this.getSearchValue(searchObj, 'utm_content');
        payload.campaign.term = payload.campaign.term || this.getSearchValue(searchObj, 'utm_term');
        payload.campaign.id = payload.campaign.id || this.getSearchValue(searchObj, 'utm_id');
        
        payload.promo = payload.promo || {};
        payload.promo.name = payload.promo.name || this.getSearchValue(searchObj, 'promo');
  
        payload.search = payload.search || {};
        payload.search.term = payload.search.term || this.getSearchValue(searchObj, 'q'); // TODO add more search parameter values
  
        // Set referrer params
        payload.referrer = payload.referrer || {};
        payload.referrer.url = payload.referrer.url || document.referrer || undefined;
        
        if (payload.referrer.url) {
          var referrerObj = this.createUrlObj(payload.referrer.url) || {};
          payload.referrer.domain = referrerObj.hostname;
          payload.referrer.path = referrerObj.pathname;
        }
        
        // Set link parameters
        if (payload.link && payload.link.url) {
          var linkObj = this.createUrlObj(payload.link.url);
          
          if (linkObj) {
            payload.link.domain = payload.link.domain || linkObj.hostname;
            payload.link.path = payload.link.path || linkObj.pathname;
          }
        }
  
        // Set video parameters
        if (payload.video && payload.video.url) {
          var videoObj = this.createUrlObj(payload.video.url);
          
          if (videoObj) {
            payload.video.domain = payload.video.domain || videoObj.hostname;
            payload.video.path = payload.video.path || videoObj.pathname;
          }
        }
        
        // Set other standard params
        payload.event_id = payload.event_id || this.createUniqueId();
        payload.event_time = payload.event_time || new Date().toISOString();
        payload.session_id = payload.session_id || this.sessionId;
        payload.client_id = payload.client_id || this.clientId;
        payload.ga_session_id = payload.ga_session_id || this.gaSessionId;
        payload.ga_client_id = payload.ga_client_id || this.gaClientId;
  
        // Convert payload to JSON
        var payloadString = JSON.stringify(payload);
  
        // Create full endpoint URL
        var baseUrl = (payload.debug && payload.debug.endpoint) ||
          this.baseUrl;
        var postUrl = baseUrl + '?event=' + payload.event_name;
  
        // Send request
        if (navigator.sendBeacon && payloadString.length < this.maxBeaconSize) {
          navigator.sendBeacon(postUrl, payloadString);
        }
  
        else {
          var xhr = new XMLHttpRequest();
          xhr.open("POST", postUrl, true); //true for asynchronous request
          xhr.setRequestHeader("Content-Type", "text/plain");
          xhr.send(payloadString);
        }
      },
  
      setCookieDomain: function(customDomain) {
        if (customDomain) {
          this.cookieDomain = customDomain;
        }
        else {
          this.cookieDomain = '.' + document.location.hostname
            .split('.')
            .slice(-2)
            .join('.');
        }
      },
  
      handleSession: function() {
        if (this.sessionHandled === true || !this.useCookies) {
          return;
        }
  
        if (!this.sessionExpiration) {
  
          if (this.sessionId) {
            this.extendSession();
          }
          else {
            this.createSession();
          }
          return;
        }
  
        var now = new Date();
  
        if (now > this.sessionExpiration ) {
          this.createSession();
        }
        else {
          this.extendSession();
        }
      },
  
      createSession: function() {
        this.log('Creating new session');
        this.eventIndex = 0;
        this.sessionId = this.createUniqueId();
        this.sessionExpiration = this.calculateSessionExpiration();
        this.sessionStorage = null;
        this.sessionEvents = null;
        this.sessionHandled = true;
  
        this.setClient();
        this.setCookie(this.sessionIdCookie, this.sessionId, this.sessionExpiration);
  
        if (this.trackNewSession) {
          this.track({event_name: 'new_session'});
        }
      },
  
      extendSession: function() {
        var newExpiration = this.calculateSessionExpiration();
        var priorExpiration = this.sessionExpiration;
        this.sessionHandled = true;
  
        // Only extend session if by more than 60 seconds
        if (priorExpiration && newExpiration.getTime() < priorExpiration.getTime() + 60000) {
          return;
        }
  
        this.sessionExpiration = newExpiration;
        this.setCookie(this.sessionIdCookie, this.sessionId, this.sessionExpiration);
  
        if (this.sessionStorage) {
          var dataString = JSON.stringify(this.sessionStorage);
          this.setCookie(this.sessionStorageCookie, encodeURIComponent(btoa(dataString)), this.sessionExpiration);
        }
  
        if (this.sessionEvents) {
          this.setCookie(this.sessionEventsCookie, encodeURIComponent(btoa(this.sessionEvents)), this.sessionExpiration);
        }
  
        this.log('Extended session');
      },
      
      setClient: function() {
        var expiration = this.calculateClientExpiration();
  
        // Existing user
        if (!this.clientId) {
          this.clientId = this.sessionId;
          
          if (this.trackNewSession) {
            this.track({event_name: 'new_user'});
          }
        }
  
        this.setCookie(this.clientIdCookie, this.clientId, expiration);
      },
  
      loadCookieData: function() {
        var cookies = {};
        var cookieString = document.cookie;
  
        if (!cookieString) {
          return;
        }
        
        var cookieList = cookieString.split('; ');
  
        for (var i = 0; i < cookieList.length; i++) {
          var cookie = cookieList[i];
          var p = cookie.indexOf('=');
          var name = cookie.substring(0, p);
          var value = cookie.substring(p + 1);
          cookies[name] = value;
        }
  
        // Get External Cookies
        this.gaClientId = cookies._ga;
  
        // Get Datm Cookies
        this.sessionId = cookies[this.sessionIdCookie];
        this.clientId = cookies[this.clientIdCookie];
        var storage = cookies[this.sessionStorageCookie];
  
        if (storage) {
          try {
            this.sessionStorage = JSON.parse(atob(decodeURIComponent(storage)));
          }
          catch(e) {
            this.sessionStorage = null;
            this.log('Error parsing session storage cookie', e, storage);
          }
        }
        else {
          this.sessionStorage = null;
        }
  
        var events = cookies[this.sessionEventsCookie];
  
        if (events) {
          this.sessionEvents = atob(decodeURIComponent(events));
        }
        else {
          this.sessionEvents = null;
        }
      },
  
      setSessionParam: function(name, value) {
        this.log('Setting session storage');
        if (!name) {
          this.log('Can\'t set session param - missing parameter name');
          return;
        }
  
        if (this.isSessionExpired()) {
          this.log('Can\'t set session param - session is expired');
          return;
        }
   
        var data = this.sessionStorage = this.sessionStorage || {};
        var nameParts = name.split('.');
        var partCount = nameParts.length;
        
        for (var i = 0; i < partCount; i++ ) {
          var part = nameParts[i];
  
          if (i < partCount - 1) {
            if (this.getType(data[part]) !== 'object') {
              data[part] = {};
            }
            
            data = data[part];
          }
          else {
            data[part] = value;
          }
        }
  
        var dataString = JSON.stringify(this.sessionStorage);
        this.setCookie(this.sessionStorageCookie, encodeURIComponent(btoa(dataString)), this.sessionExpiration);
      },
  
      getSessionParam: function(name) {
        if (this.isSessionExpired()) {
          this.log('Can\'t get session param - session is expired')
          return
        }
        
        if (!name) {
          this.log('Can\'t get session param - missing parameter name');
          return;
        }
  
        var data = this.sessionStorage || {};
        var nameParts = name.split('.');
        var partCount = nameParts.length;
        
        for (var i = 0; i < partCount; i++ ) {
          var part = nameParts[i];
  
          if (i < partCount - 1) {
            data = data[part]; // Move down one level
  
            if (typeof data !== 'object') {
              this.log('Error accessing object property. Object not defined');
              return;
            }
          }
          else {
            return data[part];
          }
        }
      },
  
      setPageParam: function(name, value) {
        if (!name) {
          this.log('Can\'t set page param - missing parameter name');
        }
        
        var data = this.pageStorage = this.pageStorage || {};
        var nameParts = name.split('.');
        var partCount = nameParts.length;
        
        for (var i = 0; i < partCount; i++ ) {
          var part = nameParts[i];
  
          if (i < partCount - 1) {
            if (this.getType(data[part]) !== 'object') {
              data[part] = {};
            }
            
            data = data[part];
          }
          else {
            data[part] = value;
          }
        }
      },
  
      getPageParam: function(name) {
        if (!name) {
          this.log('Can\'t get page param - missing parameter name');
          return this.pageStorage[name];
        }
  
        var data = this.pageStorage || {};
        var nameParts = name.split('.');
        var partCount = nameParts.length;
        
        for (var i = 0; i < partCount; i++ ) {
          var part = nameParts[i];
  
          if (i < partCount - 1) {
            data = data[part];
  
            if (this.getType(data) !== 'object' && this.getType(data) !== 'array') {
              this.log('Error accessing object property. Object not defined');
              return;
            }
          }
          else {
            return data[part];
          }
        }
      },
  
      createUniqueId: function() {
        return Date.now()
          + '-'
          + ('000000' + Math.floor(Math.random() * 0xffffff).toString(16))
            .slice(-6)
            .toUpperCase();
      },
  
      calculateSessionExpiration: function() {
        var date = new Date();
        date.setTime(date.getTime() + (this.sessionDuration * 60 * 1000));
        return date;
      },
  
      calculateClientExpiration: function() {
        var date = new Date();
        date.setFullYear(date.getFullYear() + 1);  // Expire in 1 year      
        return date;
      },
  
      setCookie: function(name, value, expireDate) {
        this.log('Set cookie:', name);
  
        document.cookie = name +
        '=' +
        value +
        '; expires=' +
        expireDate.toUTCString() +
        '; domain=' +
        this.cookieDomain +
        '; path=/';
      },
  
      isNewSession: function() {
        if (!this.useCookies) {
          return;
        }
  
        if (!this.sessionExpiration) {
          return true;
        }
  
        var now = new Date();
        return this.sessionExpiration < now;
      },
  
      getType: function(value) {
        var type = Object.prototype.toString.call(value)
          .slice(8, -1)
          .toLowerCase();
        return type;
      },
  
      ifNull: function(value, defaultValue) {
        if (value || value === 0 || value === false) {
          return value;
        }
        else {
          return defaultValue;
        }
      },
  
      createUrlObj: function(url) {
        if (url) {
          try {
            return new URL(url);
          }
          catch {
            // Do nothing
          }
        }
      },
      
      createSearchObj: function(search) {
        if (search) {
          try {
            return new URLSearchParams(search);
          }
          catch {
            // Do nothing;
          }
        }
      },
  
      getSearchKeys: function(search) {
        if (search) {
          var searchKeys = Array.from(search.keys());
          return searchKeys.sort().join();
        }
      },
  
      getSearchValue: function(search, key) {
        if (search && key) {
          return search.get(key) || undefined;
        }
      },
  
      mergeObjects: function(primaryObj, secondaryObj) {
        if (!primaryObj || !secondaryObj) {
          return;
        }
        
        for (var key in secondaryObj) {
          if (Object.prototype.hasOwnProperty.call(secondaryObj, key) &&
              secondaryObj[key] != null) {
            if (primaryObj[key] == null) {
              primaryObj[key] = secondaryObj[key];
            }
            else if (typeof secondaryObj[key] === 'object' &&
              !Array.isArray(secondaryObj[key]) &&
              typeof primaryObj[key] === 'object' &&
              !Array.isArray(primaryObj[key])
            ) {
              this.mergeObjects(primaryObj[key], secondaryObj[key]);
            }
          }
        }
      },
  
      log: function(value1, value2, value3) {
        if (!this.loggingEnabled && !config.loggingEnabled) return;
        
        if (value3 !== undefined) {
          console.log('[DATM]', value1, value2, value3);
        }
        else if (value2 !== undefined) {
          console.log('[DATM]', value1, value2);
        }
        else {
          console.log('[DATM]', value1);
        }
      }
    };
  
    // Process queue
    var datmList = window.datm || [];
    var config;
    
    while (datmList.length > 0) {
      var request = datmList.shift();
  
      if (request.action === 'initialize') {
        config = request;
        tracker.config = true;
      }
      else {
        tracker.queue.push(request);
      }
    }
  
    if (config) {
      tracker.push(config);
    }
  
    // Global tracker
    window.datm = tracker;
  
  })(window);