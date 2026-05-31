__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "Video", {
    enumerable: true,
    get: function () {
      return _Video2.default;
    }
  });
  Object.defineProperty(exports, "Audio", {
    enumerable: true,
    get: function () {
      return Audio;
    }
  });
  var _Audio = require(_dependencyMap[0]);
  var Audio = _interopNamespace(_Audio);
  var _Video = require(_dependencyMap[1]);
  var _Video2 = _interopDefault(_Video);
  var _AVTypes = require(_dependencyMap[2]);
  Object.keys(_AVTypes).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _AVTypes[k];
        }
      });
    }
  });
  var _AudioTypes = require(_dependencyMap[3]);
  Object.keys(_AudioTypes).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _AudioTypes[k];
        }
      });
    }
  });
  var _VideoTypes = require(_dependencyMap[4]);
  Object.keys(_VideoTypes).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _VideoTypes[k];
        }
      });
    }
  });
  let loggedDeprecationWarning = false;
  if (!loggedDeprecationWarning) {
    console.warn('[expo-av]: Expo AV has been deprecated and will be removed in SDK 54. Use the `expo-audio` and `expo-video` packages to replace the required functionality.');
    loggedDeprecationWarning = true;
  }
},1769,[1770,1780,1778,1771,1784]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "setIsEnabledAsync", {
    enumerable: true,
    get: function () {
      return _AudioAudioAvailability.setIsEnabledAsync;
    }
  });
  Object.defineProperty(exports, "PitchCorrectionQuality", {
    enumerable: true,
    get: function () {
      return _AV.PitchCorrectionQuality;
    }
  });
  exports.setAudioModeAsync = setAudioModeAsync;
  var _AudioTypes = require(_dependencyMap[0]);
  var _ExponentAV = require(_dependencyMap[1]);
  var ExponentAV = _interopDefault(_ExponentAV);
  var _AudioRecording = require(_dependencyMap[2]);
  Object.keys(_AudioRecording).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _AudioRecording[k];
        }
      });
    }
  });
  var _AudioSound = require(_dependencyMap[3]);
  Object.keys(_AudioSound).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _AudioSound[k];
        }
      });
    }
  });
  var _AudioAudioAvailability = require(_dependencyMap[4]);
  var _AV = require(_dependencyMap[5]);
  const _populateMissingKeys = (userAudioMode, defaultAudioMode) => {
    for (const key in defaultAudioMode) {
      if (!userAudioMode.hasOwnProperty(key)) {
        const prop = key;
        userAudioMode[prop] = defaultAudioMode[prop];
      }
    }
    return userAudioMode;
  };
  const defaultMode = {
    allowsRecordingIOS: false,
    interruptionModeIOS: _AudioTypes.InterruptionModeIOS.MixWithOthers,
    playsInSilentModeIOS: false,
    staysActiveInBackground: false,
    interruptionModeAndroid: _AudioTypes.InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false
  };
  let currentAudioMode = null;
  function getCurrentAudioMode() {
    if (!currentAudioMode) {
      return defaultMode;
    }
    return currentAudioMode;
  }
  /**
   * We provide this API to customize the audio experience on iOS and Android.
   * @param partialMode
   * @return A `Promise` that will reject if the audio mode could not be enabled for the device.
   */
  async function setAudioModeAsync(partialMode) {
    const mode = _populateMissingKeys(partialMode, getCurrentAudioMode());
    if (!_AudioTypes.InterruptionModeIOS[mode.interruptionModeIOS]) {
      throw new Error(`"interruptionModeIOS" was set to an invalid value.`);
    }
    if (!_AudioTypes.InterruptionModeAndroid[mode.interruptionModeAndroid]) {
      throw new Error(`"interruptionModeAndroid" was set to an invalid value.`);
    }
    if (typeof mode.allowsRecordingIOS !== 'boolean' || typeof mode.playsInSilentModeIOS !== 'boolean' || typeof mode.staysActiveInBackground !== 'boolean' || typeof mode.shouldDuckAndroid !== 'boolean' || typeof mode.playThroughEarpieceAndroid !== 'boolean') {
      throw new Error('"allowsRecordingIOS", "playsInSilentModeIOS", "playThroughEarpieceAndroid", "staysActiveInBackground" and "shouldDuckAndroid" must be booleans.');
    }
    currentAudioMode = mode;
    return await ExponentAV.default.setAudioMode(mode);
  }
},1770,[1771,1772,1774,1776,1775,1777]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "InterruptionModeIOS", {
    enumerable: true,
    get: function () {
      return InterruptionModeIOS;
    }
  });
  Object.defineProperty(exports, "InterruptionModeAndroid", {
    enumerable: true,
    get: function () {
      return InterruptionModeAndroid;
    }
  });
  // @needsAudit
  /**
   * @platform ios
   */
  var InterruptionModeIOS;
  (function (InterruptionModeIOS) {
    /**
     * **This is the default option.** If this option is set, your experience's audio is mixed with audio playing in background apps.
     */
    InterruptionModeIOS[InterruptionModeIOS["MixWithOthers"] = 0] = "MixWithOthers";
    /**
     * If this option is set, your experience's audio interrupts audio from other apps.
     */
    InterruptionModeIOS[InterruptionModeIOS["DoNotMix"] = 1] = "DoNotMix";
    /**
     * If this option is set, your experience's audio lowers the volume ("ducks") of audio from other apps while your audio plays.
     */
    InterruptionModeIOS[InterruptionModeIOS["DuckOthers"] = 2] = "DuckOthers";
  })(InterruptionModeIOS || (InterruptionModeIOS = {}));
  /**
   * @platform android
   */
  var InterruptionModeAndroid;
  (function (InterruptionModeAndroid) {
    /**
     * If this option is set, your experience's audio interrupts audio from other apps.
     */
    InterruptionModeAndroid[InterruptionModeAndroid["DoNotMix"] = 1] = "DoNotMix";
    /**
     * **This is the default option.** If this option is set, your experience's audio lowers the volume ("ducks") of audio from other apps while your audio plays.
     */
    InterruptionModeAndroid[InterruptionModeAndroid["DuckOthers"] = 2] = "DuckOthers";
  })(InterruptionModeAndroid || (InterruptionModeAndroid = {}));
},1771,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function () {
      return _default;
    }
  });
  var _expoModulesCore = require(_dependencyMap[0]);
  var _reactNativeWebDistExportsDeviceEventEmitter = require(_dependencyMap[1]);
  var DeviceEventEmitter = _interopDefault(_reactNativeWebDistExportsDeviceEventEmitter);
  var _AudioRecordingConstants = require(_dependencyMap[2]);
  async function getPermissionWithQueryAsync(name) {
    if (!navigator || !navigator.permissions || !navigator.permissions.query) return null;
    try {
      const {
        state
      } = await navigator.permissions.query({
        name
      });
      switch (state) {
        case 'granted':
          return _expoModulesCore.PermissionStatus.GRANTED;
        case 'denied':
          return _expoModulesCore.PermissionStatus.DENIED;
        default:
          return _expoModulesCore.PermissionStatus.UNDETERMINED;
      }
    } catch {
      // Firefox - TypeError: 'microphone' (value of 'name' member of PermissionDescriptor) is not a valid value for enumeration PermissionName.
      return _expoModulesCore.PermissionStatus.UNDETERMINED;
    }
  }
  function getUserMedia(constraints) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      return navigator.mediaDevices.getUserMedia(constraints);
    }
    // Some browsers partially implement mediaDevices. We can't just assign an object
    // with getUserMedia as it would overwrite existing properties.
    // Here, we will just add the getUserMedia property if it's missing.
    // First get ahold of the legacy getUserMedia, if present
    const getUserMedia =
    // TODO: this method is deprecated, migrate to https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
    navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || function () {
      const error = new Error('Permission unimplemented');
      error.code = 0;
      error.name = 'NotAllowedError';
      throw error;
    };
    return new Promise((resolve, reject) => {
      // TODO(@kitten): The types indicates that this is incorrect.
      // Please check whether this is correct!
      // @ts-expect-error: The `successCallback` doesn't match a `resolve` function
      getUserMedia.call(navigator, constraints, resolve, reject);
    });
  }
  function getStatusFromMedia(media) {
    if (!media) {
      return {
        isLoaded: false,
        error: undefined
      };
    }
    const isPlaying = !!(media.currentTime > 0 && !media.paused && !media.ended && media.readyState > 2);
    const status = {
      isLoaded: true,
      uri: media.src,
      progressUpdateIntervalMillis: 100,
      //TODO: Bacon: Add interval between calls
      durationMillis: media.duration * 1000,
      positionMillis: media.currentTime * 1000,
      // playableDurationMillis: media.buffered * 1000,
      // seekMillisToleranceBefore?: number
      // seekMillisToleranceAfter?: number
      shouldPlay: media.autoplay,
      isPlaying,
      isBuffering: false,
      //media.waiting,
      rate: media.playbackRate,
      // TODO: Bacon: This seems too complicated right now: https://webaudio.github.io/web-audio-api/#dom-biquadfilternode-frequency
      shouldCorrectPitch: false,
      volume: media.volume,
      audioPan: 0,
      isMuted: media.muted,
      isLooping: media.loop,
      didJustFinish: media.ended
    };
    return status;
  }
  async function setStatusForMedia(media, status) {
    if (status.positionMillis !== undefined) {
      media.currentTime = status.positionMillis / 1000;
    }
    // if (status.progressUpdateIntervalMillis !== undefined) {
    //   media.progressUpdateIntervalMillis = status.progressUpdateIntervalMillis;
    // }
    // if (status.seekMillisToleranceBefore !== undefined) {
    //   media.seekMillisToleranceBefore = status.seekMillisToleranceBefore;
    // }
    // if (status.seekMillisToleranceAfter !== undefined) {
    //   media.seekMillisToleranceAfter = status.seekMillisToleranceAfter;
    // }
    // if (status.shouldCorrectPitch !== undefined) {
    //   media.shouldCorrectPitch = status.shouldCorrectPitch;
    // }
    if (status.shouldPlay !== undefined) {
      if (status.shouldPlay) {
        await media.play();
      } else {
        await media.pause();
      }
    }
    if (status.rate !== undefined) {
      media.playbackRate = status.rate;
    }
    if (status.shouldCorrectPitch !== undefined) {
      media.preservesPitch = status.shouldCorrectPitch;
    }
    if (status.volume !== undefined) {
      media.volume = status.volume;
    }
    if (status.isMuted !== undefined) {
      media.muted = status.isMuted;
    }
    if (status.isLooping !== undefined) {
      media.loop = status.isLooping;
    }
    return getStatusFromMedia(media);
  }
  let mediaRecorder = null;
  let mediaRecorderUptimeOfLastStartResume = 0;
  let mediaRecorderDurationAlreadyRecorded = 0;
  let mediaRecorderIsRecording = false;
  function getAudioRecorderDurationMillis() {
    let duration = mediaRecorderDurationAlreadyRecorded;
    if (mediaRecorderIsRecording && mediaRecorderUptimeOfLastStartResume > 0) {
      duration += Date.now() - mediaRecorderUptimeOfLastStartResume;
    }
    return duration;
  }
  var _default = {
    async getStatusForVideo(element) {
      return getStatusFromMedia(element);
    },
    async loadForVideo(element, nativeSource, fullInitialStatus) {
      return getStatusFromMedia(element);
    },
    async unloadForVideo(element) {
      return getStatusFromMedia(element);
    },
    async setStatusForVideo(element, status) {
      return setStatusForMedia(element, status);
    },
    async replayVideo(element, status) {
      return setStatusForMedia(element, status);
    },
    /* Audio */
    async setAudioMode() {},
    async setAudioIsEnabled() {},
    async getStatusForSound(element) {
      return getStatusFromMedia(element);
    },
    async loadForSound(nativeSource, fullInitialStatus) {
      const source = typeof nativeSource === 'string' ? nativeSource : nativeSource.uri;
      const media = new Audio(source);
      media.ontimeupdate = () => {
        DeviceEventEmitter.default.emit('didUpdatePlaybackStatus', {
          key: media,
          status: getStatusFromMedia(media)
        });
      };
      media.onerror = () => {
        DeviceEventEmitter.default.emit('ExponentAV.onError', {
          key: media,
          error: media.error.message
        });
      };
      const status = await setStatusForMedia(media, fullInitialStatus);
      return [media, status];
    },
    async unloadForSound(element) {
      element.pause();
      element.removeAttribute('src');
      element.load();
      return getStatusFromMedia(element);
    },
    async setStatusForSound(element, status) {
      return setStatusForMedia(element, status);
    },
    async replaySound(element, status) {
      return setStatusForMedia(element, status);
    },
    /* Recording */
    //   async setUnloadedCallbackForAndroidRecording() {},
    async getAudioRecordingStatus() {
      return {
        canRecord: mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'inactive',
        isRecording: mediaRecorder?.state === 'recording',
        isDoneRecording: false,
        durationMillis: getAudioRecorderDurationMillis(),
        uri: null
      };
    },
    // TODO(@kitten): Needs to be typed
    async prepareAudioRecorder(options) {
      if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
        throw new Error('No media devices available');
      }
      mediaRecorderUptimeOfLastStartResume = 0;
      mediaRecorderDurationAlreadyRecorded = 0;
      const stream = await getUserMedia({
        audio: true
      });
      mediaRecorder = new window.MediaRecorder(stream, options?.web || _AudioRecordingConstants.RecordingOptionsPresets.HIGH_QUALITY.web);
      mediaRecorder.addEventListener('pause', () => {
        mediaRecorderDurationAlreadyRecorded = getAudioRecorderDurationMillis();
        mediaRecorderIsRecording = false;
      });
      mediaRecorder.addEventListener('resume', () => {
        mediaRecorderUptimeOfLastStartResume = Date.now();
        mediaRecorderIsRecording = true;
      });
      mediaRecorder.addEventListener('start', () => {
        mediaRecorderUptimeOfLastStartResume = Date.now();
        mediaRecorderDurationAlreadyRecorded = 0;
        mediaRecorderIsRecording = true;
      });
      mediaRecorder.addEventListener('stop', () => {
        mediaRecorderDurationAlreadyRecorded = getAudioRecorderDurationMillis();
        mediaRecorderIsRecording = false;
        // Clears recording icon in Chrome tab
        stream.getTracks().forEach(track => track.stop());
      });
      const {
        uri,
        ...status
      } = await this.getAudioRecordingStatus();
      return {
        uri: null,
        status
      };
    },
    async startAudioRecording() {
      if (mediaRecorder === null) {
        throw new Error('Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.');
      }
      if (mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
      } else {
        mediaRecorder.start();
      }
      return this.getAudioRecordingStatus();
    },
    async pauseAudioRecording() {
      if (mediaRecorder === null) {
        throw new Error('Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.');
      }
      // Set status to paused
      mediaRecorder.pause();
      return this.getAudioRecordingStatus();
    },
    async stopAudioRecording() {
      const _mediaRecorder = mediaRecorder;
      if (_mediaRecorder === null) {
        throw new Error('Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.');
      }
      if (_mediaRecorder.state === 'inactive') {
        return this.getAudioRecordingStatus();
      }
      const dataPromise = new Promise(resolve => _mediaRecorder.addEventListener('dataavailable', e => resolve(e.data)));
      _mediaRecorder.stop();
      const data = await dataPromise;
      const url = URL.createObjectURL(data);
      return {
        ...(await this.getAudioRecordingStatus()),
        uri: url
      };
    },
    async unloadAudioRecorder() {
      mediaRecorder = null;
    },
    async getPermissionsAsync() {
      const maybeStatus = await getPermissionWithQueryAsync('microphone');
      switch (maybeStatus) {
        case _expoModulesCore.PermissionStatus.GRANTED:
          return {
            status: _expoModulesCore.PermissionStatus.GRANTED,
            expires: 'never',
            canAskAgain: true,
            granted: true
          };
        case _expoModulesCore.PermissionStatus.DENIED:
          return {
            status: _expoModulesCore.PermissionStatus.DENIED,
            expires: 'never',
            canAskAgain: true,
            granted: false
          };
        default:
          return await this.requestPermissionsAsync();
      }
    },
    async requestPermissionsAsync() {
      try {
        const stream = await getUserMedia({
          audio: true
        });
        stream.getTracks().forEach(track => track.stop());
        return {
          status: _expoModulesCore.PermissionStatus.GRANTED,
          expires: 'never',
          canAskAgain: true,
          granted: true
        };
      } catch {
        return {
          status: _expoModulesCore.PermissionStatus.DENIED,
          expires: 'never',
          canAskAgain: true,
          granted: false
        };
      }
    }
  };
},1772,[225,440,1773]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "AndroidOutputFormat", {
    enumerable: true,
    get: function () {
      return AndroidOutputFormat;
    }
  });
  Object.defineProperty(exports, "AndroidAudioEncoder", {
    enumerable: true,
    get: function () {
      return AndroidAudioEncoder;
    }
  });
  Object.defineProperty(exports, "IOSOutputFormat", {
    enumerable: true,
    get: function () {
      return IOSOutputFormat;
    }
  });
  Object.defineProperty(exports, "IOSAudioQuality", {
    enumerable: true,
    get: function () {
      return IOSAudioQuality;
    }
  });
  Object.defineProperty(exports, "IOSBitRateStrategy", {
    enumerable: true,
    get: function () {
      return IOSBitRateStrategy;
    }
  });
  Object.defineProperty(exports, "RecordingOptionsPresets", {
    enumerable: true,
    get: function () {
      return RecordingOptionsPresets;
    }
  });
  /**
   * Defines the output format.
   * @platform android
   */
  var AndroidOutputFormat;
  (function (AndroidOutputFormat) {
    AndroidOutputFormat[AndroidOutputFormat["DEFAULT"] = 0] = "DEFAULT";
    /**
     * 3GPP media file format.
     */
    AndroidOutputFormat[AndroidOutputFormat["THREE_GPP"] = 1] = "THREE_GPP";
    /**
     * MPEG4 media file format.
     */
    AndroidOutputFormat[AndroidOutputFormat["MPEG_4"] = 2] = "MPEG_4";
    /**
     * AMR NB file format.
     */
    AndroidOutputFormat[AndroidOutputFormat["AMR_NB"] = 3] = "AMR_NB";
    /**
     * AMR WB file format.
     */
    AndroidOutputFormat[AndroidOutputFormat["AMR_WB"] = 4] = "AMR_WB";
    // @docsMissing
    AndroidOutputFormat[AndroidOutputFormat["AAC_ADIF"] = 5] = "AAC_ADIF";
    /**
     * AAC ADTS file format.
     */
    AndroidOutputFormat[AndroidOutputFormat["AAC_ADTS"] = 6] = "AAC_ADTS";
    // @docsMissing
    AndroidOutputFormat[AndroidOutputFormat["RTP_AVP"] = 7] = "RTP_AVP";
    /**
     * H.264/AAC data encapsulated in MPEG2/TS.
     */
    AndroidOutputFormat[AndroidOutputFormat["MPEG2TS"] = 8] = "MPEG2TS";
    /**
     * VP8/VORBIS data in a WEBM container.
     */
    AndroidOutputFormat[AndroidOutputFormat["WEBM"] = 9] = "WEBM";
  })(AndroidOutputFormat || (AndroidOutputFormat = {}));
  /**
   * Defines the audio encoding.
   * @platform android
   */
  var AndroidAudioEncoder;
  (function (AndroidAudioEncoder) {
    AndroidAudioEncoder[AndroidAudioEncoder["DEFAULT"] = 0] = "DEFAULT";
    /**
     * AMR (Narrowband) audio codec.
     */
    AndroidAudioEncoder[AndroidAudioEncoder["AMR_NB"] = 1] = "AMR_NB";
    /**
     * AMR (Wideband) audio codec.
     */
    AndroidAudioEncoder[AndroidAudioEncoder["AMR_WB"] = 2] = "AMR_WB";
    /**
     * AAC Low Complexity (AAC-LC) audio codec.
     */
    AndroidAudioEncoder[AndroidAudioEncoder["AAC"] = 3] = "AAC";
    /**
     * High Efficiency AAC (HE-AAC) audio codec.
     */
    AndroidAudioEncoder[AndroidAudioEncoder["HE_AAC"] = 4] = "HE_AAC";
    /**
     * Enhanced Low Delay AAC (AAC-ELD) audio codec.
     */
    AndroidAudioEncoder[AndroidAudioEncoder["AAC_ELD"] = 5] = "AAC_ELD";
  })(AndroidAudioEncoder || (AndroidAudioEncoder = {}));
  // @docsMissing
  /**
   * > **Note:** Not all of the iOS formats included in this list of constants are currently supported by iOS,
   * > in spite of appearing in the Apple source code. For an accurate list of formats supported by iOS, see
   * > [Core Audio Codecs](https://developer.apple.com/library/content/documentation/MusicAudio/Conceptual/CoreAudioOverview/CoreAudioEssentials/CoreAudioEssentials.html)
   * > and [iPhone Audio File Formats](https://developer.apple.com/library/content/documentation/MusicAudio/Conceptual/CoreAudioOverview/CoreAudioEssentials/CoreAudioEssentials.html).
   *
   * @platform ios
   */
  var IOSOutputFormat;
  (function (IOSOutputFormat) {
    IOSOutputFormat["LINEARPCM"] = "lpcm";
    IOSOutputFormat["AC3"] = "ac-3";
    IOSOutputFormat["60958AC3"] = "cac3";
    IOSOutputFormat["APPLEIMA4"] = "ima4";
    IOSOutputFormat["MPEG4AAC"] = "aac ";
    IOSOutputFormat["MPEG4CELP"] = "celp";
    IOSOutputFormat["MPEG4HVXC"] = "hvxc";
    IOSOutputFormat["MPEG4TWINVQ"] = "twvq";
    IOSOutputFormat["MACE3"] = "MAC3";
    IOSOutputFormat["MACE6"] = "MAC6";
    IOSOutputFormat["ULAW"] = "ulaw";
    IOSOutputFormat["ALAW"] = "alaw";
    IOSOutputFormat["QDESIGN"] = "QDMC";
    IOSOutputFormat["QDESIGN2"] = "QDM2";
    IOSOutputFormat["QUALCOMM"] = "Qclp";
    IOSOutputFormat["MPEGLAYER1"] = ".mp1";
    IOSOutputFormat["MPEGLAYER2"] = ".mp2";
    IOSOutputFormat["MPEGLAYER3"] = ".mp3";
    IOSOutputFormat["APPLELOSSLESS"] = "alac";
    IOSOutputFormat["MPEG4AAC_HE"] = "aach";
    IOSOutputFormat["MPEG4AAC_LD"] = "aacl";
    IOSOutputFormat["MPEG4AAC_ELD"] = "aace";
    IOSOutputFormat["MPEG4AAC_ELD_SBR"] = "aacf";
    IOSOutputFormat["MPEG4AAC_ELD_V2"] = "aacg";
    IOSOutputFormat["MPEG4AAC_HE_V2"] = "aacp";
    IOSOutputFormat["MPEG4AAC_SPATIAL"] = "aacs";
    IOSOutputFormat["AMR"] = "samr";
    IOSOutputFormat["AMR_WB"] = "sawb";
    IOSOutputFormat["AUDIBLE"] = "AUDB";
    IOSOutputFormat["ILBC"] = "ilbc";
    IOSOutputFormat[IOSOutputFormat["DVIINTELIMA"] = 1836253201] = "DVIINTELIMA";
    IOSOutputFormat[IOSOutputFormat["MICROSOFTGSM"] = 1836253233] = "MICROSOFTGSM";
    IOSOutputFormat["AES3"] = "aes3";
    IOSOutputFormat["ENHANCEDAC3"] = "ec-3";
  })(IOSOutputFormat || (IOSOutputFormat = {}));
  // @docsMissing
  /**
   * @platform ios
   */
  var IOSAudioQuality;
  (function (IOSAudioQuality) {
    IOSAudioQuality[IOSAudioQuality["MIN"] = 0] = "MIN";
    IOSAudioQuality[IOSAudioQuality["LOW"] = 32] = "LOW";
    IOSAudioQuality[IOSAudioQuality["MEDIUM"] = 64] = "MEDIUM";
    IOSAudioQuality[IOSAudioQuality["HIGH"] = 96] = "HIGH";
    IOSAudioQuality[IOSAudioQuality["MAX"] = 127] = "MAX";
  })(IOSAudioQuality || (IOSAudioQuality = {}));
  // @docsMissing
  /**
   * @platform ios
   */
  var IOSBitRateStrategy;
  (function (IOSBitRateStrategy) {
    IOSBitRateStrategy[IOSBitRateStrategy["CONSTANT"] = 0] = "CONSTANT";
    IOSBitRateStrategy[IOSBitRateStrategy["LONG_TERM_AVERAGE"] = 1] = "LONG_TERM_AVERAGE";
    IOSBitRateStrategy[IOSBitRateStrategy["VARIABLE_CONSTRAINED"] = 2] = "VARIABLE_CONSTRAINED";
    IOSBitRateStrategy[IOSBitRateStrategy["VARIABLE"] = 3] = "VARIABLE";
  })(IOSBitRateStrategy || (IOSBitRateStrategy = {}));
  // TODO : maybe make presets for music and speech, or lossy / lossless.
  const HIGH_QUALITY = {
    isMeteringEnabled: true,
    android: {
      extension: '.m4a',
      outputFormat: AndroidOutputFormat.MPEG_4,
      audioEncoder: AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000
    },
    ios: {
      extension: '.m4a',
      outputFormat: IOSOutputFormat.MPEG4AAC,
      audioQuality: IOSAudioQuality.MAX,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000
    }
  };
  const LOW_QUALITY = {
    isMeteringEnabled: true,
    android: {
      extension: '.3gp',
      outputFormat: AndroidOutputFormat.THREE_GPP,
      audioEncoder: AndroidAudioEncoder.AMR_NB,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000
    },
    ios: {
      extension: '.m4a',
      audioQuality: IOSAudioQuality.MIN,
      outputFormat: IOSOutputFormat.MPEG4AAC,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 64000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000
    }
  };
  /**
   * Constant which contains definitions of the two preset examples of `RecordingOptions`, as implemented in the Audio SDK.
   *
   * # `HIGH_QUALITY`
   * ```ts
   * RecordingOptionsPresets.HIGH_QUALITY = {
   *   isMeteringEnabled: true,
   *   android: {
   *     extension: '.m4a',
   *     outputFormat: AndroidOutputFormat.MPEG_4,
   *     audioEncoder: AndroidAudioEncoder.AAC,
   *     sampleRate: 44100,
   *     numberOfChannels: 2,
   *     bitRate: 128000,
   *   },
   *   ios: {
   *     extension: '.m4a',
   *     outputFormat: IOSOutputFormat.MPEG4AAC,
   *     audioQuality: IOSAudioQuality.MAX,
   *     sampleRate: 44100,
   *     numberOfChannels: 2,
   *     bitRate: 128000,
   *     linearPCMBitDepth: 16,
   *     linearPCMIsBigEndian: false,
   *     linearPCMIsFloat: false,
   *   },
   *   web: {
   *     mimeType: 'audio/webm',
   *     bitsPerSecond: 128000,
   *   },
   * };
   * ```
   *
   * # `LOW_QUALITY`
   * ```ts
   * RecordingOptionsPresets.LOW_QUALITY = {
   *   isMeteringEnabled: true,
   *   android: {
   *     extension: '.3gp',
   *     outputFormat: AndroidOutputFormat.THREE_GPP,
   *     audioEncoder: AndroidAudioEncoder.AMR_NB,
   *     sampleRate: 44100,
   *     numberOfChannels: 2,
   *     bitRate: 128000,
   *   },
   *   ios: {
   *     extension: '.caf',
   *     audioQuality: IOSAudioQuality.MIN,
   *     sampleRate: 44100,
   *     numberOfChannels: 2,
   *     bitRate: 128000,
   *     linearPCMBitDepth: 16,
   *     linearPCMIsBigEndian: false,
   *     linearPCMIsFloat: false,
   *   },
   *   web: {
   *     mimeType: 'audio/webm',
   *     bitsPerSecond: 128000,
   *   },
   * };
   * ```
   */
  const RecordingOptionsPresets = {
    HIGH_QUALITY,
    LOW_QUALITY
  };
},1773,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  exports.getPermissionsAsync = getPermissionsAsync;
  exports.requestPermissionsAsync = requestPermissionsAsync;
  Object.defineProperty(exports, "usePermissions", {
    enumerable: true,
    get: function () {
      return usePermissions;
    }
  });
  Object.defineProperty(exports, "Recording", {
    enumerable: true,
    get: function () {
      return Recording;
    }
  });
  Object.defineProperty(exports, "PermissionStatus", {
    enumerable: true,
    get: function () {
      return _expoModulesCore.PermissionStatus;
    }
  });
  var _expoModulesCore = require(_dependencyMap[0]);
  var _AudioAvailability = require(_dependencyMap[1]);
  var _RecordingConstants = require(_dependencyMap[2]);
  Object.keys(_RecordingConstants).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _RecordingConstants[k];
        }
      });
    }
  });
  var _Sound = require(_dependencyMap[3]);
  var _AV = require(_dependencyMap[4]);
  var _ExponentAV = require(_dependencyMap[5]);
  var ExponentAV = _interopDefault(_ExponentAV);
  var _RecordingTypes = require(_dependencyMap[6]);
  Object.keys(_RecordingTypes).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _RecordingTypes[k];
        }
      });
    }
  });
  let _recorderExists = false;
  const eventEmitter = null;
  /**
   * Checks user's permissions for audio recording.
   * @return A promise that resolves to an object of type `PermissionResponse`.
   * @platform android
   * @platform ios
   */
  async function getPermissionsAsync() {
    return ExponentAV.default.getPermissionsAsync();
  }
  /**
   * Asks the user to grant permissions for audio recording.
   * @return A promise that resolves to an object of type `PermissionResponse`.
   * @platform android
   * @platform ios
   */
  async function requestPermissionsAsync() {
    return ExponentAV.default.requestPermissionsAsync();
  }
  /**
   * Check or request permissions to record audio.
   * This uses both `requestPermissionAsync` and `getPermissionsAsync` to interact with the permissions.
   *
   * @example
   * ```ts
   * const [permissionResponse, requestPermission] = Audio.usePermissions();
   * ```
   */
  const usePermissions = (0, _expoModulesCore.createPermissionHook)({
    getMethod: getPermissionsAsync,
    requestMethod: requestPermissionsAsync
  });
  // @needsAudit
  /**
   * > **warning** **Warning**: Experimental for web.
   *
   * This class represents an audio recording. After creating an instance of this class, `prepareToRecordAsync`
   * must be called in order to record audio. Once recording is finished, call `stopAndUnloadAsync`. Note that
   * only one recorder is allowed to exist in the state between `prepareToRecordAsync` and `stopAndUnloadAsync`
   * at any given time.
   *
   * Note that your experience must request audio recording permissions in order for recording to function.
   * See the [`Permissions` module](/guides/permissions) for more details.
   *
   * Additionally, audio recording is [not supported in the iOS Simulator](/workflow/ios-simulator/#limitations).
   *
   * @example
   * ```ts
   * const recording = new Audio.Recording();
   * try {
   *   await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
   *   await recording.startAsync();
   *   // You are now recording!
   * } catch (error) {
   *   // An error occurred!
   * }
   * ```
   *
   * @return A newly constructed instance of `Audio.Recording`.
   * @platform android
   * @platform ios
   */
  class Recording {
    _subscription = null;
    _canRecord = false;
    _isDoneRecording = false;
    _finalDurationMillis = 0;
    _uri = null;
    _onRecordingStatusUpdate = null;
    _progressUpdateTimeoutVariable = null;
    _progressUpdateIntervalMillis = _AV._DEFAULT_PROGRESS_UPDATE_INTERVAL_MILLIS;
    _options = null;
    // Internal methods
    _cleanupForUnloadedRecorder = async finalStatus => {
      this._canRecord = false;
      this._isDoneRecording = true;
      this._finalDurationMillis = finalStatus?.durationMillis ?? 0;
      _recorderExists = false;
      if (this._subscription) {
        this._subscription.remove();
        this._subscription = null;
      }
      this._disablePolling();
      return await this.getStatusAsync(); // Automatically calls onRecordingStatusUpdate for the final state.
    };
    _pollingLoop = async () => {
      if ((0, _AudioAvailability.isAudioEnabled)() && this._canRecord && this._onRecordingStatusUpdate != null) {
        this._progressUpdateTimeoutVariable = setTimeout(this._pollingLoop, this._progressUpdateIntervalMillis);
        try {
          await this.getStatusAsync();
        } catch {
          this._disablePolling();
        }
      }
    };
    _disablePolling() {
      if (this._progressUpdateTimeoutVariable != null) {
        clearTimeout(this._progressUpdateTimeoutVariable);
        this._progressUpdateTimeoutVariable = null;
      }
    }
    _enablePollingIfNecessaryAndPossible() {
      if ((0, _AudioAvailability.isAudioEnabled)() && this._canRecord && this._onRecordingStatusUpdate != null) {
        this._disablePolling();
        this._pollingLoop();
      }
    }
    _callOnRecordingStatusUpdateForNewStatus(status) {
      if (this._onRecordingStatusUpdate != null) {
        this._onRecordingStatusUpdate(status);
      }
    }
    async _performOperationAndHandleStatusAsync(operation) {
      (0, _AudioAvailability.throwIfAudioIsDisabled)();
      if (this._canRecord) {
        const status = await operation();
        this._callOnRecordingStatusUpdateForNewStatus(status);
        return status;
      } else {
        throw new Error('Cannot complete operation because this recorder is not ready to record.');
      }
    }
    /**
     * Creates and starts a recording using the given options, with optional `onRecordingStatusUpdate` and `progressUpdateIntervalMillis`.
     *
     * ```ts
     * const { recording, status } = await Audio.Recording.createAsync(
     *   options,
     *   onRecordingStatusUpdate,
     *   progressUpdateIntervalMillis
     * );
     *
     * // Which is equivalent to the following:
     * const recording = new Audio.Recording();
     * await recording.prepareToRecordAsync(options);
     * recording.setOnRecordingStatusUpdate(onRecordingStatusUpdate);
     * await recording.startAsync();
     * ```
     *
     * @param options Options for the recording, including sample rate, bitrate, channels, format, encoder, and extension. If no options are passed to,
     * the recorder will be created with options `Audio.RecordingOptionsPresets.LOW_QUALITY`. See below for details on `RecordingOptions`.
     * @param onRecordingStatusUpdate A function taking a single parameter `status` (a dictionary, described in `getStatusAsync`).
     * @param progressUpdateIntervalMillis The interval between calls of `onRecordingStatusUpdate`. This value defaults to 500 milliseconds.
     *
     * @example
     * ```ts
     * try {
     *   const { recording: recordingObject, status } = await Audio.Recording.createAsync(
     *     Audio.RecordingOptionsPresets.HIGH_QUALITY
     *   );
     *   // You are now recording!
     * } catch (error) {
     *   // An error occurred!
     * }
     * ```
     *
     * @return A `Promise` that is rejected if creation failed, or fulfilled with the following dictionary if creation succeeded.
     */
    static createAsync = async (options = _RecordingConstants.RecordingOptionsPresets.LOW_QUALITY, onRecordingStatusUpdate = null, progressUpdateIntervalMillis = null) => {
      const recording = new Recording();
      if (progressUpdateIntervalMillis) {
        recording._progressUpdateIntervalMillis = progressUpdateIntervalMillis;
      }
      recording.setOnRecordingStatusUpdate(onRecordingStatusUpdate);
      await recording.prepareToRecordAsync({
        ...options,
        keepAudioActiveHint: true
      });
      try {
        const status = await recording.startAsync();
        return {
          recording,
          status
        };
      } catch (err) {
        recording.stopAndUnloadAsync().catch(_e => {
          // Since there was an issue with starting, when trying calling stopAndUnloadAsync
          // the promise is rejected which is unhandled
          // lets catch it since its expected
        });
        throw err;
      }
    };
    // Get status API
    /**
     * Gets the `status` of the `Recording`.
     * @return A `Promise` that is resolved with the `RecordingStatus` object.
     */
    getStatusAsync = async () => {
      // Automatically calls onRecordingStatusUpdate.
      if (this._canRecord) {
        return this._performOperationAndHandleStatusAsync(() => ExponentAV.default.getAudioRecordingStatus());
      }
      const status = {
        canRecord: false,
        isRecording: false,
        isDoneRecording: this._isDoneRecording,
        durationMillis: this._finalDurationMillis
      };
      this._callOnRecordingStatusUpdateForNewStatus(status);
      return status;
    };
    /**
     * Sets a function to be called regularly with the `RecordingStatus` of the `Recording`.
     *
     * `onRecordingStatusUpdate` will be called when another call to the API for this recording completes (such as `prepareToRecordAsync()`,
     * `startAsync()`, `getStatusAsync()`, or `stopAndUnloadAsync()`), and will also be called at regular intervals while the recording can record.
     * Call `setProgressUpdateInterval()` to modify the interval with which `onRecordingStatusUpdate` is called while the recording can record.
     *
     * @param onRecordingStatusUpdate A function taking a single parameter `RecordingStatus`.
     */
    setOnRecordingStatusUpdate(onRecordingStatusUpdate) {
      this._onRecordingStatusUpdate = onRecordingStatusUpdate;
      if (onRecordingStatusUpdate == null) {
        this._disablePolling();
      } else {
        this._enablePollingIfNecessaryAndPossible();
      }
      this.getStatusAsync();
    }
    /**
     * Sets the interval with which `onRecordingStatusUpdate` is called while the recording can record.
     * See `setOnRecordingStatusUpdate` for details. This value defaults to 500 milliseconds.
     * @param progressUpdateIntervalMillis The new interval between calls of `onRecordingStatusUpdate`.
     */
    setProgressUpdateInterval(progressUpdateIntervalMillis) {
      this._progressUpdateIntervalMillis = progressUpdateIntervalMillis;
      this.getStatusAsync();
    }
    // Record API
    /**
     * Loads the recorder into memory and prepares it for recording. This must be called before calling `startAsync()`.
     * This method can only be called if the `Recording` instance has never yet been prepared.
     *
     * @param options `RecordingOptions` for the recording, including sample rate, bitrate, channels, format, encoder, and extension.
     * If no options are passed to `prepareToRecordAsync()`, the recorder will be created with options `Audio.RecordingOptionsPresets.LOW_QUALITY`.
     *
     * @return A `Promise` that is fulfilled when the recorder is loaded and prepared, or rejects if this failed. If another `Recording` exists
     * in your experience that is currently prepared to record, the `Promise` will reject. If the `RecordingOptions` provided are invalid,
     * the `Promise` will also reject. The promise is resolved with the `RecordingStatus` of the recording.
     */
    async prepareToRecordAsync(options = _RecordingConstants.RecordingOptionsPresets.LOW_QUALITY) {
      (0, _AudioAvailability.throwIfAudioIsDisabled)();
      if (_recorderExists) {
        throw new Error('Only one Recording object can be prepared at a given time.');
      }
      if (this._isDoneRecording) {
        throw new Error('This Recording object is done recording; you must make a new one.');
      }
      if (!options || !options.android || !options.ios) {
        throw new Error('You must provide recording options for android and ios in order to prepare to record.');
      }
      const extensionRegex = /^\.\w+$/;
      if (!options.android.extension || !options.ios.extension || !extensionRegex.test(options.android.extension) || !extensionRegex.test(options.ios.extension)) {
        throw new Error(`Your file extensions must match ${extensionRegex.toString()}.`);
      }
      if (!this._canRecord) {
        const {
          uri,
          status
        } = await ExponentAV.default.prepareAudioRecorder(options);
        _recorderExists = true;
        this._uri = uri;
        this._options = options;
        this._canRecord = true;
        const currentStatus = {
          ...status,
          canRecord: true
        };
        this._callOnRecordingStatusUpdateForNewStatus(currentStatus);
        this._enablePollingIfNecessaryAndPossible();
        return currentStatus;
      } else {
        throw new Error('This Recording object is already prepared to record.');
      }
    }
    /**
     * Returns a list of available recording inputs. This method can only be called if the `Recording` has been prepared.
     * @return A `Promise` that is fulfilled with an array of `RecordingInput` objects.
     */
    async getAvailableInputs() {
      return ExponentAV.default.getAvailableInputs();
    }
    /**
     * Returns the currently-selected recording input. This method can only be called if the `Recording` has been prepared.
     * @return A `Promise` that is fulfilled with a `RecordingInput` object.
     */
    async getCurrentInput() {
      return ExponentAV.default.getCurrentInput();
    }
    /**
     * Sets the current recording input.
     * @param inputUid The uid of a `RecordingInput`.
     * @return A `Promise` that is resolved if successful or rejected if not.
     */
    async setInput(inputUid) {
      return ExponentAV.default.setInput(inputUid);
    }
    /**
     * Begins recording. This method can only be called if the `Recording` has been prepared.
     * @return A `Promise` that is fulfilled when recording has begun, or rejects if recording could not be started.
     * The promise is resolved with the `RecordingStatus` of the recording.
     */
    async startAsync() {
      return this._performOperationAndHandleStatusAsync(() => ExponentAV.default.startAudioRecording());
    }
    /**
     * Pauses recording. This method can only be called if the `Recording` has been prepared.
     *
     * > This is only available on Android API version 24 and later.
     *
     * @return A `Promise` that is fulfilled when recording has paused, or rejects if recording could not be paused.
     * If the Android API version is less than 24, the `Promise` will reject. The promise is resolved with the
     * `RecordingStatus` of the recording.
     */
    async pauseAsync() {
      return this._performOperationAndHandleStatusAsync(() => ExponentAV.default.pauseAudioRecording());
    }
    /**
     * Stops the recording and deallocates the recorder from memory. This reverts the `Recording` instance
     * to an unprepared state, and another `Recording` instance must be created in order to record again.
     * This method can only be called if the `Recording` has been prepared.
     *
     * > On Android this method may fail with `E_AUDIO_NODATA` when called too soon after `startAsync` and
     * > no audio data has been recorded yet. In that case the recorded file will be invalid and should be discarded.
     *
     * @return A `Promise` that is fulfilled when recording has stopped, or rejects if recording could not be stopped.
     * The promise is resolved with the `RecordingStatus` of the recording.
     */
    async stopAndUnloadAsync() {
      if (!this._canRecord) {
        if (this._isDoneRecording) {
          throw new Error('Cannot unload a Recording that has already been unloaded.');
        } else {
          throw new Error('Cannot unload a Recording that has not been prepared.');
        }
      }
      // We perform a separate native API call so that the state of the Recording can be updated with
      // the final duration of the recording. (We cast stopStatus as Object to appease Flow)
      let stopResult;
      let stopError;
      try {
        stopResult = await ExponentAV.default.stopAudioRecording();
      } catch (err) {
        stopError = err;
      }
      // Web has to return the URI at the end of recording, so needs a little destructuring
      if (stopResult?.uri !== undefined) {
        this._uri = stopResult.uri;
      }
      // Clean-up and return status
      await ExponentAV.default.unloadAudioRecorder();
      const status = await this._cleanupForUnloadedRecorder(stopResult);
      return stopError ? Promise.reject(stopError) : status;
    }
    // Read API
    /**
     * Gets the local URI of the `Recording`. Note that this will only succeed once the `Recording` is prepared
     * to record. On web, this will not return the URI until the recording is finished.
     * @return A `string` with the local URI of the `Recording`, or `null` if the `Recording` is not prepared
     * to record (or, on Web, if the recording has not finished).
     */
    getURI() {
      return this._uri;
    }
    /**
     * @deprecated Use `createNewLoadedSoundAsync()` instead.
     */
    async createNewLoadedSound(initialStatus = {}, onPlaybackStatusUpdate = null) {
      console.warn(`createNewLoadedSound is deprecated in favor of createNewLoadedSoundAsync, which has the same API aside from the method name`);
      return this.createNewLoadedSoundAsync(initialStatus, onPlaybackStatusUpdate);
    }
    /**
     * Creates and loads a new `Sound` object to play back the `Recording`. Note that this will only succeed once the `Recording`
     * is done recording and `stopAndUnloadAsync()` has been called.
     *
     * @param initialStatus The initial intended `PlaybackStatusToSet` of the sound, whose values will override the default initial playback status.
     * This value defaults to `{}` if no parameter is passed. See the [AV documentation](/versions/latest/sdk/av) for details on `PlaybackStatusToSet`
     * and the default initial playback status.
     * @param onPlaybackStatusUpdate A function taking a single parameter `PlaybackStatus`. This value defaults to `null` if no parameter is passed.
     * See the [AV documentation](/versions/latest/sdk/av) for details on the functionality provided by `onPlaybackStatusUpdate`
     *
     * @return A `Promise` that is rejected if creation failed, or fulfilled with the `SoundObject`.
     */
    async createNewLoadedSoundAsync(initialStatus = {}, onPlaybackStatusUpdate = null) {
      if (this._uri == null || !this._isDoneRecording) {
        throw new Error('Cannot create sound when the Recording has not finished!');
      }
      return _Sound.Sound.createAsync({
        uri: this._uri
      }, initialStatus, onPlaybackStatusUpdate, false);
    }
  }
},1774,[225,1775,1773,1776,1777,1772,1779]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  exports.isAudioEnabled = isAudioEnabled;
  exports.throwIfAudioIsDisabled = throwIfAudioIsDisabled;
  exports.setIsEnabledAsync = setIsEnabledAsync;
  var _ExponentAV = require(_dependencyMap[0]);
  var ExponentAV = _interopDefault(_ExponentAV);
  let _enabled = true;
  function isAudioEnabled() {
    return _enabled;
  }
  function throwIfAudioIsDisabled() {
    if (!_enabled) {
      throw new Error('Cannot complete operation because audio is not enabled.');
    }
  }
  // @needsAudit
  /**
   * Audio is enabled by default, but if you want to write your own Audio API in a bare workflow app, you might want to disable the Audio API.
   * @param value `true` enables Audio, and `false` disables it.
   * @return A `Promise` that will reject if audio playback could not be enabled for the device.
   */
  async function setIsEnabledAsync(value) {
    _enabled = value;
    await ExponentAV.default.setAudioIsEnabled(value);
    // TODO : We immediately pause all players when disabled, but we do not resume all shouldPlay
    // players when enabled. Perhaps for completeness we should allow this; the design of the
    // enabling API is for people to enable / disable this audio library, but I think that it should
    // intuitively also double as a global pause/resume.
  }
},1775,[1772]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "Sound", {
    enumerable: true,
    get: function () {
      return Sound;
    }
  });
  var _expoModulesCore = require(_dependencyMap[0]);
  var _AudioAvailability = require(_dependencyMap[1]);
  var _AV = require(_dependencyMap[2]);
  var _ExponentAV = require(_dependencyMap[3]);
  var ExponentAV = _interopDefault(_ExponentAV);
  // @needsAudit
  /**
   * This class represents a sound corresponding to an Asset or URL.
   * @return A newly constructed instance of `Audio.Sound`.
   *
   * @example
   * ```ts
   * const sound = new Audio.Sound();
   * try {
   *   await sound.loadAsync(require('./assets/sounds/hello.mp3'));
   *   await sound.playAsync();
   *   // Your sound is playing!
   *
   *   // Don't forget to unload the sound from memory
   *   // when you are done using the Sound object
   *   await sound.unloadAsync();
   * } catch (error) {
   *   // An error occurred!
   * }
   * ```
   *
   * > Method not described below and the rest of the API for `Audio.Sound` is the same as the imperative playback API for `Video`.
   * > See the [AV documentation](/versions/latest/sdk/av) for further information.
   */
  class Sound {
    _loaded = false;
    _loading = false;
    _key = null;
    _lastStatusUpdate = null;
    _lastStatusUpdateTime = null;
    _subscriptions = [];
    _eventEmitter = new _expoModulesCore.LegacyEventEmitter(ExponentAV.default);
    _coalesceStatusUpdatesInMillis = 100;
    _onPlaybackStatusUpdate = null;
    _onMetadataUpdate = null;
    _onAudioSampleReceived = null;
    /** @deprecated Use `Sound.createAsync()` instead */
    static create = async (source, initialStatus = {}, onPlaybackStatusUpdate = null, downloadFirst = true) => {
      console.warn(`Sound.create is deprecated in favor of Sound.createAsync with the same API except for the new method name`);
      return Sound.createAsync(source, initialStatus, onPlaybackStatusUpdate, downloadFirst);
    };
    /**
     * Creates and loads a sound from source.
     *
     * ```ts
     * const { sound } = await Audio.Sound.createAsync(
     *   source,
     *   initialStatus,
     *   onPlaybackStatusUpdate,
     *   downloadFirst
     * );
     *
     * // Which is equivalent to the following:
     * const sound = new Audio.Sound();
     * sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
     * await sound.loadAsync(source, initialStatus, downloadFirst);
     * ```
     *
     * @param source The source of the sound. See the [AV documentation](/versions/latest/sdk/av/#playback-api) for details on the possible `source` values.
     *
     * @param initialStatus The initial intended `PlaybackStatusToSet` of the sound, whose values will override the default initial playback status.
     * This value defaults to `{}` if no parameter is passed. See the [AV documentation](/versions/latest/sdk/av) for details on `PlaybackStatusToSet` and the default
     * initial playback status.
     *
     * @param onPlaybackStatusUpdate A function taking a single parameter `PlaybackStatus`. This value defaults to `null` if no parameter is passed.
     * See the [AV documentation](/versions/latest/sdk/av) for details on the functionality provided by `onPlaybackStatusUpdate`
     *
     * @param downloadFirst If set to true, the system will attempt to download the resource to the device before loading. This value defaults to `true`.
     * Note that at the moment, this will only work for `source`s of the form `require('path/to/file')` or `Asset` objects.
     *
     * @example
     * ```ts
     * try {
     *   const { sound: soundObject, status } = await Audio.Sound.createAsync(
     *     require('./assets/sounds/hello.mp3'),
     *     { shouldPlay: true }
     *   );
     *   // Your sound is playing!
     * } catch (error) {
     *   // An error occurred!
     * }
     * ```
     *
     * @return A `Promise` that is rejected if creation failed, or fulfilled with the `SoundObject` if creation succeeded.
     */
    static createAsync = async (source, initialStatus = {}, onPlaybackStatusUpdate = null, downloadFirst = true) => {
      const sound = new Sound();
      sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
      const status = await sound.loadAsync(source, initialStatus, downloadFirst);
      return {
        sound,
        status
      };
    };
    // Internal methods
    _callOnPlaybackStatusUpdateForNewStatus(status) {
      const shouldDismissBasedOnCoalescing = this._lastStatusUpdateTime && JSON.stringify(status) === this._lastStatusUpdate && Date.now() - this._lastStatusUpdateTime.getTime() < this._coalesceStatusUpdatesInMillis;
      if (this._onPlaybackStatusUpdate != null && !shouldDismissBasedOnCoalescing) {
        this._onPlaybackStatusUpdate(status);
        this._lastStatusUpdateTime = new Date();
        this._lastStatusUpdate = JSON.stringify(status);
      }
    }
    async _performOperationAndHandleStatusAsync(operation) {
      (0, _AudioAvailability.throwIfAudioIsDisabled)();
      if (this._loaded) {
        const status = await operation();
        this._callOnPlaybackStatusUpdateForNewStatus(status);
        return status;
      } else {
        throw new Error('Cannot complete operation because sound is not loaded.');
      }
    }
    _updateAudioSampleReceivedCallback() {
      if (globalThis.__EXAV_setOnAudioSampleReceivedCallback == null) {
        {
          throw new _expoModulesCore.UnavailabilityError('expo-av', 'setOnAudioSampleReceived');
        }
      }
      if (this._key == null) {
        throw new Error('Cannot set Audio Sample Buffer callback when the Sound instance has not been successfully loaded/initialized!');
      }
      if (typeof this._key !== 'number') {
        throw new Error(`Cannot set Audio Sample Buffer callback when Sound instance key is of type ${typeof this._key}! (expected: number)`);
      }
      globalThis.__EXAV_setOnAudioSampleReceivedCallback(this._key, this._onAudioSampleReceived);
    }
    _internalStatusUpdateCallback = ({
      key,
      status
    }) => {
      if (this._key === key) {
        this._callOnPlaybackStatusUpdateForNewStatus(status);
      }
    };
    _internalMetadataUpdateCallback = ({
      key,
      metadata
    }) => {
      if (this._key === key) {
        this._onMetadataUpdate?.(metadata);
      }
    };
    _internalErrorCallback = ({
      key,
      error
    }) => {
      if (this._key === key) {
        this._errorCallback(error);
      }
    };
    // TODO: We can optimize by only using time observer on native if (this._onPlaybackStatusUpdate).
    _subscribeToNativeEvents() {
      if (this._loaded) {
        this._subscriptions.push(this._eventEmitter.addListener('didUpdatePlaybackStatus', this._internalStatusUpdateCallback), this._eventEmitter.addListener('didUpdateMetadata', this._internalMetadataUpdateCallback));
        this._subscriptions.push(this._eventEmitter.addListener('ExponentAV.onError', this._internalErrorCallback));
      }
    }
    _clearSubscriptions() {
      this._subscriptions.forEach(e => e.remove());
      this._subscriptions = [];
    }
    _errorCallback = error => {
      this._clearSubscriptions();
      this._loaded = false;
      this._key = null;
      this._callOnPlaybackStatusUpdateForNewStatus((0, _AV.getUnloadedStatus)(error));
    };
    // ### Unified playback API ### (consistent with Video.js)
    // All calls automatically call onPlaybackStatusUpdate as a side effect.
    // Get status API
    getStatusAsync = async () => {
      if (this._loaded) {
        return this._performOperationAndHandleStatusAsync(() => ExponentAV.default.getStatusForSound(this._key));
      }
      const status = (0, _AV.getUnloadedStatus)();
      this._callOnPlaybackStatusUpdateForNewStatus(status);
      return status;
    };
    /**
     * Sets a function to be called regularly with the `AVPlaybackStatus` of the playback object.
     *
     * `onPlaybackStatusUpdate` will be called whenever a call to the API for this playback object completes
     * (such as `setStatusAsync()`, `getStatusAsync()`, or `unloadAsync()`), nd will also be called at regular intervals
     * while the media is in the loaded state.
     *
     * Set `progressUpdateIntervalMillis` via `setStatusAsync()` or `setProgressUpdateIntervalAsync()` to modify
     * the interval with which `onPlaybackStatusUpdate` is called while loaded.
     *
     * @param onPlaybackStatusUpdate A function taking a single parameter `AVPlaybackStatus`.
     */
    setOnPlaybackStatusUpdate(onPlaybackStatusUpdate) {
      this._onPlaybackStatusUpdate = onPlaybackStatusUpdate;
      this.getStatusAsync();
    }
    /**
     * Sets a function to be called whenever the metadata of the sound object changes, if one is set.
     * @param onMetadataUpdate A function taking a single object of type `AVMetadata` as a parameter.
     * @platform ios
     */
    setOnMetadataUpdate(onMetadataUpdate) {
      this._onMetadataUpdate = onMetadataUpdate;
    }
    /**
     * Sets a function to be called during playback, receiving the audio sample as parameter.
     * @param callback A function taking the `AudioSampleCallback` as parameter.
     */
    setOnAudioSampleReceived(callback) {
      this._onAudioSampleReceived = callback;
      if (this._key != null) {
        this._updateAudioSampleReceivedCallback();
      }
    }
    // Loading / unloading API
    async loadAsync(source, initialStatus = {}, downloadFirst = true) {
      (0, _AudioAvailability.throwIfAudioIsDisabled)();
      if (this._loading) {
        throw new Error('The Sound is already loading.');
      }
      if (!this._loaded) {
        this._loading = true;
        const {
          nativeSource,
          fullInitialStatus
        } = await (0, _AV.getNativeSourceAndFullInitialStatusForLoadAsync)(source, initialStatus, downloadFirst);
        // This is a workaround, since using load with resolve / reject seems to not work.
        return new Promise((resolve, reject) => {
          const loadSuccess = result => {
            const [key, status] = result;
            this._key = key;
            this._loaded = true;
            this._loading = false;
            this._subscribeToNativeEvents();
            this._callOnPlaybackStatusUpdateForNewStatus(status);
            resolve(status);
          };
          const loadError = error => {
            this._loading = false;
            reject(error);
          };
          ExponentAV.default.loadForSound(nativeSource, fullInitialStatus).then(loadSuccess).catch(loadError);
        });
      } else {
        throw new Error('The Sound is already loaded.');
      }
    }
    async unloadAsync() {
      if (this._loaded) {
        this._loaded = false;
        const key = this._key;
        this._key = null;
        const status = await ExponentAV.default.unloadForSound(key);
        this._callOnPlaybackStatusUpdateForNewStatus(status);
        this._clearSubscriptions();
        return status;
      } else {
        return this.getStatusAsync(); // Automatically calls onPlaybackStatusUpdate.
      }
    }
    // Set status API (only available while isLoaded = true)
    async setStatusAsync(status) {
      (0, _AV.assertStatusValuesInBounds)(status);
      return this._performOperationAndHandleStatusAsync(() => ExponentAV.default.setStatusForSound(this._key, status));
    }
    async replayAsync(status = {}) {
      if (status.positionMillis && status.positionMillis !== 0) {
        throw new Error('Requested position after replay has to be 0.');
      }
      return this._performOperationAndHandleStatusAsync(() => ExponentAV.default.replaySound(this._key, {
        ...status,
        positionMillis: 0,
        shouldPlay: true
      }));
    }
    // Methods of the Playback interface that are set via PlaybackMixin
  }
  Object.assign(Sound.prototype, _AV.PlaybackMixin);
},1776,[225,1775,1777,1772]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "_DEFAULT_PROGRESS_UPDATE_INTERVAL_MILLIS", {
    enumerable: true,
    get: function () {
      return _DEFAULT_PROGRESS_UPDATE_INTERVAL_MILLIS;
    }
  });
  Object.defineProperty(exports, "_DEFAULT_INITIAL_PLAYBACK_STATUS", {
    enumerable: true,
    get: function () {
      return _DEFAULT_INITIAL_PLAYBACK_STATUS;
    }
  });
  exports.getNativeSourceFromSource = getNativeSourceFromSource;
  exports.assertStatusValuesInBounds = assertStatusValuesInBounds;
  exports.getNativeSourceAndFullInitialStatusForLoadAsync = getNativeSourceAndFullInitialStatusForLoadAsync;
  exports.getUnloadedStatus = getUnloadedStatus;
  Object.defineProperty(exports, "PlaybackMixin", {
    enumerable: true,
    get: function () {
      return PlaybackMixin;
    }
  });
  var _expoAsset = require(_dependencyMap[0]);
  require(_dependencyMap[1]);
  var _AVTypes = require(_dependencyMap[2]);
  Object.keys(_AVTypes).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _AVTypes[k];
        }
      });
    }
  });
  // TODO add:
  //  disableFocusOnAndroid
  //  audio routes (at least did become noisy on android)
  //  pan
  //  pitch
  //  API to explicitly request audio focus / session
  //  API to select stream type on Android
  //  subtitles API
  /**
   * @hidden
   */
  const _DEFAULT_PROGRESS_UPDATE_INTERVAL_MILLIS = 500;
  // @needsAudit
  /**
   * The default initial `AVPlaybackStatusToSet` of all `Audio.Sound` objects and `Video` components is as follows:
   *
   * ```javascript
   * {
   *   progressUpdateIntervalMillis: 500,
   *   positionMillis: 0,
   *   shouldPlay: false,
   *   rate: 1.0,
   *   shouldCorrectPitch: false,
   *   volume: 1.0,
   *   isMuted: false,
   *   isLooping: false,
   * }
   * ```
   *
   * This default initial status can be overwritten by setting the optional `initialStatus` in `loadAsync()` or `Audio.Sound.createAsync()`.
   */
  const _DEFAULT_INITIAL_PLAYBACK_STATUS = {
    positionMillis: 0,
    progressUpdateIntervalMillis: _DEFAULT_PROGRESS_UPDATE_INTERVAL_MILLIS,
    shouldPlay: false,
    rate: 1.0,
    shouldCorrectPitch: false,
    volume: 1.0,
    audioPan: 0,
    isMuted: false,
    isLooping: false
  };
  // @needsAudit
  /**
   * @hidden
   */
  function getNativeSourceFromSource(source) {
    let uri = null;
    let overridingExtension = null;
    let headers;
    if (typeof source === 'string' && true) {
      return {
        uri: source,
        overridingExtension,
        headers
      };
    }
    const asset = _getAssetFromPlaybackSource(source);
    if (asset != null) {
      uri = asset.localUri || asset.uri;
    } else if (source != null && typeof source !== 'number' && 'uri' in source && typeof source.uri === 'string') {
      uri = source.uri;
    }
    if (uri == null) {
      return null;
    }
    if (source != null && typeof source !== 'number' && 'overrideFileExtensionAndroid' in source && typeof source.overrideFileExtensionAndroid === 'string') {
      overridingExtension = source.overrideFileExtensionAndroid;
    }
    if (source != null && typeof source !== 'number' && 'headers' in source && typeof source.headers === 'object') {
      headers = source.headers;
    }
    return {
      uri,
      overridingExtension,
      headers
    };
  }
  function _getAssetFromPlaybackSource(source) {
    if (source == null) {
      return null;
    }
    let asset = null;
    if (typeof source === 'number') {
      asset = _expoAsset.Asset.fromModule(source);
    } else if (source instanceof _expoAsset.Asset) {
      asset = source;
    }
    return asset;
  }
  // @needsAudit
  /**
   * @hidden
   */
  function assertStatusValuesInBounds(status) {
    if (typeof status.rate === 'number' && (status.rate < 0 || status.rate > 32)) {
      throw new RangeError('Rate value must be between 0.0 and 32.0');
    }
    if (typeof status.volume === 'number' && (status.volume < 0 || status.volume > 1)) {
      throw new RangeError('Volume value must be between 0.0 and 1.0');
    }
    if (typeof status.audioPan === 'number' && (status.audioPan < -1 || status.audioPan > 1)) {
      throw new RangeError('Pan value must be between -1.0 and 1.0');
    }
  }
  // @needsAudit
  /**
   * @hidden
   */
  async function getNativeSourceAndFullInitialStatusForLoadAsync(source, initialStatus, downloadFirst) {
    // Get the full initial status
    const fullInitialStatus = initialStatus == null ? _DEFAULT_INITIAL_PLAYBACK_STATUS : {
      ..._DEFAULT_INITIAL_PLAYBACK_STATUS,
      ...initialStatus
    };
    assertStatusValuesInBounds(fullInitialStatus);
    if (typeof source === 'string' && true) {
      return {
        nativeSource: {
          uri: source,
          overridingExtension: null
        },
        fullInitialStatus
      };
    }
    // Download first if necessary.
    const asset = _getAssetFromPlaybackSource(source);
    if (downloadFirst && asset) {
      // TODO we can download remote uri too once @nikki93 has integrated this into Asset
      await asset.downloadAsync();
    }
    // Get the native source
    const nativeSource = getNativeSourceFromSource(source);
    if (nativeSource === null) {
      throw new Error(`Cannot load an AV asset from a null playback source`);
    }
    // If asset has been downloaded use the localUri
    if (asset && asset.localUri) {
      nativeSource.uri = asset.localUri;
    }
    return {
      nativeSource,
      fullInitialStatus
    };
  }
  // @needsAudit
  /**
   * @hidden
   */
  function getUnloadedStatus(error = null) {
    return {
      isLoaded: false,
      ...(error ? {
        error
      } : null)
    };
  }
  /**
   * @hidden
   * A mixin that defines common playback methods for A/V classes, so they implement the `Playback`
   * interface.
   */
  const PlaybackMixin = {
    async playAsync() {
      return this.setStatusAsync({
        shouldPlay: true
      });
    },
    async playFromPositionAsync(positionMillis, tolerances = {}) {
      return this.setStatusAsync({
        positionMillis,
        shouldPlay: true,
        seekMillisToleranceAfter: tolerances.toleranceMillisAfter,
        seekMillisToleranceBefore: tolerances.toleranceMillisBefore
      });
    },
    async pauseAsync() {
      return this.setStatusAsync({
        shouldPlay: false
      });
    },
    async stopAsync() {
      return this.setStatusAsync({
        positionMillis: 0,
        shouldPlay: false
      });
    },
    async setPositionAsync(positionMillis, tolerances = {}) {
      return this.setStatusAsync({
        positionMillis,
        seekMillisToleranceAfter: tolerances.toleranceMillisAfter,
        seekMillisToleranceBefore: tolerances.toleranceMillisBefore
      });
    },
    async setRateAsync(rate, shouldCorrectPitch = false, pitchCorrectionQuality = _AVTypes.PitchCorrectionQuality.Medium) {
      return this.setStatusAsync({
        rate,
        shouldCorrectPitch,
        pitchCorrectionQuality
      });
    },
    async setVolumeAsync(volume, audioPan) {
      return this.setStatusAsync({
        volume,
        audioPan
      });
    },
    async setIsMutedAsync(isMuted) {
      return this.setStatusAsync({
        isMuted
      });
    },
    async setIsLoopingAsync(isLooping) {
      return this.setStatusAsync({
        isLooping
      });
    },
    async setProgressUpdateIntervalAsync(progressUpdateIntervalMillis) {
      return this.setStatusAsync({
        progressUpdateIntervalMillis
      });
    }
  };
},1777,[270,225,1778]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "PitchCorrectionQuality", {
    enumerable: true,
    get: function () {
      return PitchCorrectionQuality;
    }
  });
  var _ExponentAV = require(_dependencyMap[0]);
  var ExponentAV = _interopDefault(_ExponentAV);
  // @needsAudit
  /**
   * Check [official Apple documentation](https://developer.apple.com/documentation/avfoundation/audio_settings/time_pitch_algorithm_settings) for more information.
   */
  var PitchCorrectionQuality;
  (function (PitchCorrectionQuality) {
    /**
     * Equivalent to `AVAudioTimePitchAlgorithmLowQualityZeroLatency`.
     */
    PitchCorrectionQuality[PitchCorrectionQuality["Low"] = ExponentAV.default && ExponentAV.default.Qualities && ExponentAV.default.Qualities.Low] = "Low";
    /**
     * Equivalent to `AVAudioTimePitchAlgorithmTimeDomain`.
     */
    PitchCorrectionQuality[PitchCorrectionQuality["Medium"] = ExponentAV.default && ExponentAV.default.Qualities && ExponentAV.default.Qualities.Medium] = "Medium";
    /**
     * Equivalent to `AVAudioTimePitchAlgorithmSpectral`.
     */
    PitchCorrectionQuality[PitchCorrectionQuality["High"] = ExponentAV.default && ExponentAV.default.Qualities && ExponentAV.default.Qualities.High] = "High";
  })(PitchCorrectionQuality || (PitchCorrectionQuality = {}));
},1778,[1772]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";
},1779,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function () {
      return _default;
    }
  });
  var _react = require(_dependencyMap[0]);
  var React = _interopNamespace(_react);
  var _reactNativeWebDistExportsFindNodeHandle = require(_dependencyMap[1]);
  var findNodeHandle = _interopDefault(_reactNativeWebDistExportsFindNodeHandle);
  var _reactNativeWebDistExportsImage = require(_dependencyMap[2]);
  var Image = _interopDefault(_reactNativeWebDistExportsImage);
  var _reactNativeWebDistExportsStyleSheet = require(_dependencyMap[3]);
  var StyleSheet = _interopDefault(_reactNativeWebDistExportsStyleSheet);
  var _reactNativeWebDistExportsView = require(_dependencyMap[4]);
  var View = _interopDefault(_reactNativeWebDistExportsView);
  require(_dependencyMap[5]);
  var _AV = require(_dependencyMap[6]);
  var _ExpoVideoManager = require(_dependencyMap[7]);
  var ExpoVideoManager = _interopDefault(_ExpoVideoManager);
  var _ExponentAV = require(_dependencyMap[8]);
  var ExponentAV = _interopDefault(_ExponentAV);
  var _ExponentVideo = require(_dependencyMap[9]);
  var ExponentVideo = _interopDefault(_ExponentVideo);
  var _VideoTypes = require(_dependencyMap[10]);
  var _reactJsxRuntime = require(_dependencyMap[11]);
  const _STYLES = StyleSheet.default.create({
    base: {
      overflow: 'hidden',
      pointerEvents: 'box-none'
    },
    poster: {
      position: 'absolute',
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      resizeMode: 'contain'
    },
    video: {
      position: 'absolute',
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    }
  });
  let didWarnAboutVideoDeprecation = false;
  // On a real device UIManager should be present, however when running offline tests with jest-expo
  // we have to use the provided native module mock to access constants
  const ExpoVideoManagerConstants = ExpoVideoManager.default;
  const ExpoVideoViewManager = ExpoVideoManager.default;
  class Video extends React.Component {
    _nativeRef = /*#__PURE__*/React.createRef();
    _onPlaybackStatusUpdate = null;
    constructor(props) {
      super(props);
      this.state = {
        showPoster: !!props.usePoster
      };
    }
    /**
     * @hidden
     */
    setNativeProps(nativeProps) {
      const nativeVideo = this._nativeRef.current;
      if (!nativeVideo) throw new Error(`native video reference is not defined.`);
      nativeVideo.setNativeProps(nativeProps);
    }
    // Internal methods
    _handleNewStatus = status => {
      if (this.state.showPoster && status.isLoaded && (status.isPlaying || status.positionMillis !== 0)) {
        this.setState({
          showPoster: false
        });
      }
      if (this.props.onPlaybackStatusUpdate) {
        this.props.onPlaybackStatusUpdate(status);
      }
      if (this._onPlaybackStatusUpdate) {
        this._onPlaybackStatusUpdate(status);
      }
    };
    _performOperationAndHandleStatusAsync = async operation => {
      const video = this._nativeRef.current;
      if (!video) {
        throw new Error(`Cannot complete operation because the Video component has not yet loaded`);
      }
      let handle = null;
      if ('getVideoElement' in this._nativeRef.current) {
        handle = this._nativeRef.current.getVideoElement();
      }
      if (!handle) {
        throw new Error('failed to find node handle');
      }
      const status = await operation(handle);
      this._handleNewStatus(status);
      return status;
    };
    // Fullscreening API
    _setFullscreen = async value => {
      return this._performOperationAndHandleStatusAsync(tag => ExpoVideoViewManager.setFullscreen(tag, value));
    };
    /**
     * This presents a fullscreen view of your video component on top of your app's UI. Note that even if `useNativeControls` is set to `false`,
     * native controls will be visible in fullscreen mode.
     * @return A `Promise` that is fulfilled with the `AVPlaybackStatus` of the video once the fullscreen player has finished presenting,
     * or rejects if there was an error, or if this was called on an Android device.
     */
    presentFullscreenPlayer = async () => {
      return this._setFullscreen(true);
    };
    /**
     * This dismisses the fullscreen video view.
     * @return A `Promise` that is fulfilled with the `AVPlaybackStatus` of the video once the fullscreen player has finished dismissing,
     * or rejects if there was an error, or if this was called on an Android device.
     */
    dismissFullscreenPlayer = async () => {
      return this._setFullscreen(false);
    };
    // ### Unified playback API ### (consistent with Audio.js)
    // All calls automatically call onPlaybackStatusUpdate as a side effect.
    /**
     * @hidden
     */
    getStatusAsync = async () => {
      return this._performOperationAndHandleStatusAsync(tag => ExponentAV.default.getStatusForVideo(tag));
    };
    /**
     * @hidden
     */
    loadAsync = async (source, initialStatus = {}, downloadFirst = true) => {
      const {
        nativeSource,
        fullInitialStatus
      } = await (0, _AV.getNativeSourceAndFullInitialStatusForLoadAsync)(source, initialStatus, downloadFirst);
      return this._performOperationAndHandleStatusAsync(tag => ExponentAV.default.loadForVideo(tag, nativeSource, fullInitialStatus));
    };
    /**
     * Equivalent to setting URI to `null`.
     * @hidden
     */
    unloadAsync = async () => {
      return this._performOperationAndHandleStatusAsync(tag => ExponentAV.default.unloadForVideo(tag));
    };
    componentWillUnmount() {
      // Auto unload video to perform necessary cleanup safely
      this.unloadAsync().catch(() => {
        // Ignored rejection. Sometimes the unloadAsync code is executed when video is already unloaded.
        // In such cases, it throws:
        // "[Unhandled promise rejection: Error: Invalid view returned from registry,
        //  expecting EXVideo, got: (null)]"
      });
    }
    /**
     * Set status API, only available while `isLoaded = true`.
     * @hidden
     */
    setStatusAsync = async status => {
      (0, _AV.assertStatusValuesInBounds)(status);
      return this._performOperationAndHandleStatusAsync(tag => ExponentAV.default.setStatusForVideo(tag, status));
    };
    /**
     * @hidden
     */
    replayAsync = async (status = {}) => {
      if (status.positionMillis && status.positionMillis !== 0) {
        throw new Error('Requested position after replay has to be 0.');
      }
      return this._performOperationAndHandleStatusAsync(tag => ExponentAV.default.replayVideo(tag, {
        ...status,
        positionMillis: 0,
        shouldPlay: true
      }));
    };
    /**
     * Sets a function to be called regularly with the `AVPlaybackStatus` of the playback object.
     *
     * `onPlaybackStatusUpdate` will be called whenever a call to the API for this playback object completes
     * (such as `setStatusAsync()`, `getStatusAsync()`, or `unloadAsync()`), nd will also be called at regular intervals
     * while the media is in the loaded state.
     *
     * Set `progressUpdateIntervalMillis` via `setStatusAsync()` or `setProgressUpdateIntervalAsync()` to modify
     * the interval with which `onPlaybackStatusUpdate` is called while loaded.
     *
     * @param onPlaybackStatusUpdate A function taking a single parameter `AVPlaybackStatus`.
     */
    setOnPlaybackStatusUpdate(onPlaybackStatusUpdate) {
      this._onPlaybackStatusUpdate = onPlaybackStatusUpdate;
      this.getStatusAsync();
    }
    // Methods of the Playback interface that are set via PlaybackMixin

    // Callback wrappers
    _nativeOnPlaybackStatusUpdate = event => {
      this._handleNewStatus(event.nativeEvent);
    };
    // TODO make sure we are passing the right stuff
    _nativeOnLoadStart = () => {
      if (this.props.onLoadStart) {
        this.props.onLoadStart();
      }
    };
    _nativeOnLoad = event => {
      if (this.props.onLoad) {
        this.props.onLoad(event.nativeEvent);
      }
      this._handleNewStatus(event.nativeEvent);
    };
    _nativeOnError = event => {
      const error = event.nativeEvent.error;
      if (this.props.onError) {
        this.props.onError(error);
      }
      this._handleNewStatus((0, _AV.getUnloadedStatus)(error));
    };
    _nativeOnReadyForDisplay = event => {
      if (this.props.onReadyForDisplay) {
        this.props.onReadyForDisplay(event.nativeEvent);
      }
    };
    _nativeOnFullscreenUpdate = event => {
      if (this.props.onFullscreenUpdate) {
        this.props.onFullscreenUpdate(event.nativeEvent);
      }
    };
    _renderPoster = () => {
      const PosterComponent = this.props.PosterComponent ?? Image.default;
      return this.props.usePoster && this.state.showPoster ? /*#__PURE__*/(0, _reactJsxRuntime.jsx)(PosterComponent, {
        style: [_STYLES.poster, this.props.posterStyle],
        source: this.props.posterSource
      }) : null;
    };
    render() {
      maybeWarnAboutVideoDeprecation();
      const source = (0, _AV.getNativeSourceFromSource)(this.props.source) || undefined;
      let nativeResizeMode = ExpoVideoManagerConstants.ScaleNone;
      if (this.props.resizeMode) {
        const resizeMode = this.props.resizeMode;
        if (resizeMode === _VideoTypes.ResizeMode.STRETCH) {
          nativeResizeMode = ExpoVideoManagerConstants.ScaleToFill;
        } else if (resizeMode === _VideoTypes.ResizeMode.CONTAIN) {
          nativeResizeMode = ExpoVideoManagerConstants.ScaleAspectFit;
        } else if (resizeMode === _VideoTypes.ResizeMode.COVER) {
          nativeResizeMode = ExpoVideoManagerConstants.ScaleAspectFill;
        }
      }
      // Set status via individual props
      const status = {
        ...this.props.status
      };
      ['progressUpdateIntervalMillis', 'positionMillis', 'shouldPlay', 'rate', 'shouldCorrectPitch', 'volume', 'isMuted', 'isLooping'].forEach(prop => {
        if (prop in this.props) {
          status[prop] = this.props[prop];
        }
      });
      // Replace selected native props
      const nativeProps = {
        ...omit(this.props, ['source', 'onPlaybackStatusUpdate', 'usePoster', 'posterSource', 'posterStyle', ...Object.keys(status)]),
        style: [_STYLES.base, this.props.style],
        videoStyle: [_STYLES.video, this.props.videoStyle],
        source,
        resizeMode: nativeResizeMode,
        status,
        onStatusUpdate: this._nativeOnPlaybackStatusUpdate,
        onLoadStart: this._nativeOnLoadStart,
        onLoad: this._nativeOnLoad,
        onError: this._nativeOnError,
        onReadyForDisplay: this._nativeOnReadyForDisplay,
        onFullscreenUpdate: this._nativeOnFullscreenUpdate
      };
      return /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: nativeProps.style,
        children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(ExponentVideo.default, {
          ref: this._nativeRef,
          ...nativeProps,
          style: nativeProps.videoStyle
        }), this._renderPoster()]
      });
    }
  }
  function omit(props, propNames) {
    const copied = {
      ...props
    };
    for (const propName of propNames) {
      delete copied[propName];
    }
    return copied;
  }
  function maybeWarnAboutVideoDeprecation() {}
  Object.assign(Video.prototype, _AV.PlaybackMixin);
  // note(simek): TypeDoc cannot resolve correctly name of inline and default exported class
  var _default = Video;
},1780,[21,296,359,137,311,115,1777,1781,1772,1783,1784,2]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function () {
      return _default;
    }
  });
  var _ExponentAV = require(_dependencyMap[0]);
  var ExponentAV = _interopDefault(_ExponentAV);
  var _FullscreenUtilsWeb = require(_dependencyMap[1]);
  var _default = {
    get ScaleNone() {
      return 'none';
    },
    get ScaleToFill() {
      return 'fill';
    },
    get ScaleAspectFit() {
      return 'contain';
    },
    get ScaleAspectFill() {
      return 'cover';
    },
    async setFullscreen(element, isFullScreenEnabled) {
      if (isFullScreenEnabled) {
        await (0, _FullscreenUtilsWeb.requestFullscreen)(element);
      } else {
        await (0, _FullscreenUtilsWeb.exitFullscreen)(element);
      }
      return ExponentAV.default.getStatusForVideo(element);
    }
  };
},1781,[1772,1782]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  exports.requestFullscreen = requestFullscreen;
  exports.exitFullscreen = exitFullscreen;
  exports.addFullscreenListener = addFullscreenListener;
  /**
   * Detect if the browser supports the standard fullscreen API on the given
   * element:
   * https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
   */
  const supportsFullscreenAPI = element => 'requestFullscreen' in element;
  /**
   * Detect if the browser supports the non-standard webkit fullscreen API on the
   * given element (looking at you, Safari).
   */
  const supportsWebkitFullscreenAPI = element => 'webkitEnterFullScreen' in element;
  /**
   * Detect if the browser supports the non-standard ms fullscreen API on the
   * given element (looking at you, IE11).
   */
  const supportsMsFullscreenAPI = element => 'msRequestFullscreen' in element;
  /**
   * Detect if the browser supports the `webkitFullscreenChange` event. This is
   * a non-standard event added to Safari on macOS by Apple:
   * https://developer.apple.com/documentation/webkitjs/document/1631998-onwebkitfullscreenchange
   */
  const supportsWebkitFullscreenChangeEvent = () => supportsEvent('video', 'webkitfullscreenchange');
  /**
   * A helper that adds an event listener to an element. The key value-add over
   * the native addEventListener is that it returns a function that will remove
   * the event listener. This allows the setup and teardown logic for a listener
   * to be easily colocated.
   */
  function addEventListener(element, eventName, listener) {
    element.addEventListener(eventName, listener);
    return () => element.removeEventListener(eventName, listener);
  }
  /**
   * Detect if the browser supports an event on a particular element type.
   */
  const supportsEvent = (elementName, eventName) => {
    // Detect if the browser supports the event by attempting to add a handler
    // attribute for that event to the provided element. If the event is supported
    // then the browser will accept the attribute and report the type of the
    // attribute as "function". See: https://stackoverflow.com/a/4562426/2747759
    const element = document.createElement(elementName);
    element.setAttribute('on' + eventName, 'return;');
    return typeof element['on' + eventName] === 'function';
  };
  /**
   * Switches a video element into fullscreen.
   */
  async function requestFullscreen(element) {
    if (supportsFullscreenAPI(element)) {
      return element.requestFullscreen();
    } else if (supportsWebkitFullscreenAPI(element)) {
      // This API is synchronous so no need to return the result
      element['webkitEnterFullScreen']?.();
    } else if (supportsMsFullscreenAPI(element)) {
      // This API is synchronous so no need to return the result
      element['msRequestFullscreen']?.();
    } else {
      throw new Error('Fullscreen not supported');
    }
  }
  /**
   * Switches a video element out of fullscreen.
   */
  async function exitFullscreen(element) {
    if (supportsFullscreenAPI(element)) {
      return document.exitFullscreen();
    } else if (supportsWebkitFullscreenAPI(element)) {
      // This API is synchronous so no need to return the result
      element['webkitExitFullScreen']?.();
    } else if (supportsMsFullscreenAPI(element)) {
      // This API is synchronous so no need to return the result
      document['msExitFullscreen']?.();
    } else {
      throw new Error('Fullscreen not supported');
    }
  }
  /**
   * Listens for fullscreen change events on a video element. The provided
   * callback will be called with `true` when the video is switched into
   * fullscreen and `false` when the video is switched out of fullscreen.
   */
  function addFullscreenListener(element, callback) {
    if (supportsFullscreenAPI(element)) {
      // Used by browsers that support the official spec
      return addEventListener(element, 'fullscreenchange', event => callback(document.fullscreenElement === event.target));
    } else if (supportsWebkitFullscreenAPI(element) && supportsWebkitFullscreenChangeEvent()) {
      // Used by Safari on macOS
      return addEventListener(element, 'webkitfullscreenchange', event => callback(document['webkitFullscreenElement'] === event.target));
    } else if (supportsWebkitFullscreenAPI(element)) {
      // Used by Safari on iOS
      const removeBeginListener = addEventListener(element, 'webkitbeginfullscreen', () => callback(true));
      const removeEndListener = addEventListener(element, 'webkitendfullscreen', () => callback(false));
      return () => {
        removeBeginListener();
        removeEndListener();
      };
    } else if (supportsMsFullscreenAPI(element)) {
      // Used by IE11
      return addEventListener(document, 'MSFullscreenChange', event => callback(document['msFullscreenElement'] === event.target));
    } else {
      return () => {};
    }
  }
},1782,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function () {
      return ExponentVideo;
    }
  });
  var _react = require(_dependencyMap[0]);
  var React = _interopNamespace(_react);
  var _reactNativeWebDistExportsCreateElement = require(_dependencyMap[1]);
  var createElement = _interopDefault(_reactNativeWebDistExportsCreateElement);
  var _ExponentAV = require(_dependencyMap[2]);
  var ExponentAV = _interopDefault(_ExponentAV);
  var _FullscreenUtilsWeb = require(_dependencyMap[3]);
  var _VideoTypes = require(_dependencyMap[4]);
  var _reactJsxRuntime = require(_dependencyMap[5]);
  const Video = /*#__PURE__*/React.forwardRef((props, ref) => (0, createElement.default)('video', {
    ...props,
    ref
  }));
  class ExponentVideo extends React.Component {
    componentWillUnmount() {
      this._removeFullscreenListener?.();
    }
    getVideoElement = () => {
      return this._video;
    };
    onFullscreenChange = isFullscreen => {
      if (!this.props.onFullscreenUpdate) return;
      if (isFullscreen) {
        this.props.onFullscreenUpdate({
          nativeEvent: {
            fullscreenUpdate: _VideoTypes.VideoFullscreenUpdate.PLAYER_DID_PRESENT
          }
        });
      } else {
        this.props.onFullscreenUpdate({
          nativeEvent: {
            fullscreenUpdate: _VideoTypes.VideoFullscreenUpdate.PLAYER_DID_DISMISS
          }
        });
      }
    };
    onStatusUpdate = async () => {
      if (!this.props.onStatusUpdate) {
        return;
      }
      const nativeEvent = await ExponentAV.default.getStatusForVideo(this._video);
      this.props.onStatusUpdate({
        nativeEvent
      });
    };
    onLoadStart = () => {
      if (!this.props.onLoadStart) {
        return;
      }
      this.props.onLoadStart();
      this.onStatusUpdate();
    };
    onLoadedData = event => {
      if (!this.props.onLoad) {
        return;
      }
      this.props.onLoad(event);
      this.onStatusUpdate();
    };
    onError = event => {
      if (!this.props.onError) {
        return;
      }
      this.props.onError(event);
      this.onStatusUpdate();
    };
    onProgress = () => {
      this.onStatusUpdate();
    };
    onSeeking = () => {
      this.onStatusUpdate();
    };
    onEnded = () => {
      this.onStatusUpdate();
    };
    onLoadedMetadata = () => {
      this.onStatusUpdate();
    };
    onCanPlay = event => {
      if (!this.props.onReadyForDisplay) {
        return;
      }
      this.props.onReadyForDisplay(event);
      this.onStatusUpdate();
    };
    onStalled = () => {
      this.onStatusUpdate();
    };
    onRef = ref => {
      this._removeFullscreenListener?.();
      if (ref) {
        this._video = ref;
        this._removeFullscreenListener = (0, _FullscreenUtilsWeb.addFullscreenListener)(this._video, this.onFullscreenChange);
        this.onStatusUpdate();
      } else {
        this._removeFullscreenListener = undefined;
      }
    };
    render() {
      const {
        source,
        status = {},
        resizeMode: objectFit,
        useNativeControls,
        style
      } = this.props;
      const customStyle = {
        position: undefined,
        objectFit,
        overflow: 'hidden'
      };
      return /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Video, {
        ref: this.onRef,
        onLoadStart: this.onLoadStart,
        onLoadedData: this.onLoadedData,
        onError: this.onError,
        onTimeUpdate: this.onProgress,
        onSeeking: this.onSeeking,
        onEnded: this.onEnded,
        onLoadedMetadata: this.onLoadedMetadata,
        onCanPlay: this.onCanPlay,
        onStalled: this.onStalled,
        src: source?.uri || undefined,
        muted: status.isMuted,
        loop: status.isLooping,
        autoPlay: status.shouldPlay,
        controls: useNativeControls,
        style: [style, customStyle],
        playsInline: true
      });
    }
  }
},1783,[21,131,1772,1782,1784,2]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "ResizeMode", {
    enumerable: true,
    get: function () {
      return ResizeMode;
    }
  });
  Object.defineProperty(exports, "VideoFullscreenUpdate", {
    enumerable: true,
    get: function () {
      return VideoFullscreenUpdate;
    }
  });
  // @needsAudit
  var ResizeMode;
  (function (ResizeMode) {
    /**
     * Fit within component bounds while preserving aspect ratio.
     */
    ResizeMode["CONTAIN"] = "contain";
    /**
     * Fill component bounds while preserving aspect ratio.
     */
    ResizeMode["COVER"] = "cover";
    /**
     * Stretch to fill component bounds.
     */
    ResizeMode["STRETCH"] = "stretch";
  })(ResizeMode || (ResizeMode = {}));
  // @needsAudit
  var VideoFullscreenUpdate;
  (function (VideoFullscreenUpdate) {
    /**
     * Describing that the fullscreen player is about to present.
     */
    VideoFullscreenUpdate[VideoFullscreenUpdate["PLAYER_WILL_PRESENT"] = 0] = "PLAYER_WILL_PRESENT";
    /**
     * Describing that the fullscreen player just finished presenting.
     */
    VideoFullscreenUpdate[VideoFullscreenUpdate["PLAYER_DID_PRESENT"] = 1] = "PLAYER_DID_PRESENT";
    /**
     * Describing that the fullscreen player is about to dismiss.
     */
    VideoFullscreenUpdate[VideoFullscreenUpdate["PLAYER_WILL_DISMISS"] = 2] = "PLAYER_WILL_DISMISS";
    /**
     * Describing that the fullscreen player just finished dismissing.
     */
    VideoFullscreenUpdate[VideoFullscreenUpdate["PLAYER_DID_DISMISS"] = 3] = "PLAYER_DID_DISMISS";
  })(VideoFullscreenUpdate || (VideoFullscreenUpdate = {}));
},1784,[]);