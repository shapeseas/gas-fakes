/**
 * these are utilities to return sync versions of functions
 */
import makeSynchronous from 'make-synchronous';
import path from 'path'
import { Auth } from "./auth.js"


const authPath = "../support/auth.js"
const drapisPath = "../services/drive/drapis.js"
const shapisPath = "../services/drive/shapis.js"
const kvPath = '../support/kv.js'

/**
 * note that the relpath of exports file 
 * is relative from the entrypoint, since all this sync stuff runs in a subprocess
 * @constant
 * @type {string}
 * @default
 */

/**
 * @param {string} [relTarget=relExports] the target module relative to this script 
 * @returns {string} the full path
 */
const getModulePath = (relTarget) => path.resolve(import.meta.dirname, relTarget)


/**
 * sync a call to google api
 * @param {object} p pargs
 * @param {string} p.prop the prop of drive eg 'files' for drive.files
 * @param {string} p.method the method of drive eg 'list' for drive.files.list
 * @param {object} p.params the params to add to the request
 * @param {string} p.apiPath where to import the api from
 * @return {DriveResponse} from the drive api
 */
const fxApi = ({ prop, method, params, apiPath }) => {

  // this will run a node child process
  // note that nothing is inherited, so consider it as a standalone script
  const fx = makeSynchronous(async ({ prop, method, apiPath, authPath, scopes, params }) => {

    const { Auth, responseSyncify } = await import(authPath)
    const { getApiClient } = await import(apiPath)

    // the scopes are required to set up an appropriate auth
    Auth.setAuth(scopes)
    const auth = Auth.getAuth()

    // this is the node drive service
    const apiClient = getApiClient(auth)
    const response = await apiClient[prop][method](params)

    return {
      data: response.data,
      response: responseSyncify(response)
    }
  })

  const scopes = Array.from(Auth.getAuthedScopes().keys())
  const result = fx({
    prop,
    method,
    apiPath: getModulePath(apiPath),
    authPath: getModulePath(authPath),
    scopes,
    params
  })
  return result
}

/**
 * because we're using a file backed cache we need to syncit
 * it'll slow it down but it's necessary to emuate apps script behavior
 * @param {object} p params
 * @param {}
 * @returns {*}
 */
const fxStore = ( storeArgs , method = "get" , ...kvArgs) => {

  const fx = makeSynchronous(async ({kvPath, kvArgs, storeArgs, method}) => {
    const { newKStore } = await import(kvPath)
    const { store } = newKStore(storeArgs)
    const result = await store[method](...kvArgs)
    return result
  })

  const result = fx({
    kvPath: getModulePath(kvPath),
    method,
    kvArgs,
    storeArgs
  })

  return result
}



/**
 * sync a call to Drive api
 * @param {object} p pargs
 * @param {string} p.prop the prop of drive eg 'files' for drive.files
 * @param {string} p.method the method of drive eg 'list' for drive.files.list
 * @param {object} p.params the params to add to the request
 * @return {DriveResponse} from the drive api
 */
const fxDrive = ({ prop, method, params }) => {
  const scopes = Array.from(Auth.getAuthedScopes().keys())
  return fxApi({
    prop,
    method,
    apiPath: drapisPath,
    authPath,
    scopes,
    params
  })

}

/**
 * sync a call to Drive api to stream a download
 * @param {object} p pargs
 * @param {string} p.prop the prop of drive eg 'files' for drive.files
 * @param {string} p.method the method of drive eg 'list' for drive.files.list
 * @param {object} p.params the params to add to the request
 * @return {DriveResponse} from the drive api
 */
const fxDriveMedia = ({ id }) => {

  // this will run a node child process
  // note that nothing is inherited, so consider it as a standalone script
  const fx = makeSynchronous(async ({ id, drapisPath, authPath, scopes }) => {

    const { Auth, responseSyncify } = await import(authPath)
    const { getApiClient } = await import(drapisPath)
    const { getStreamAsBuffer } = await import('get-stream');

    // the scopes are required to set up an appropriate auth
    Auth.setAuth(scopes)
    const auth = Auth.getAuth()

    // this is the node drive service
    const drive = getApiClient(auth)
    const streamed = await drive.files.get({
      fileId: id,
      alt: 'media'
    }, {
      responseType: 'stream'
    })
    const response = responseSyncify(streamed)

    if (response.status === 200) {
      const buf = await getStreamAsBuffer(streamed.data)
      const data = Array.from(buf)

      return {
        data,
        response
      }
    } else {
      return {
        data: null,
        response
      }
    }

  })

  const scopes = Array.from(Auth.getAuthedScopes().keys())
  const result = fx({
    id,
    drapisPath: getModulePath(drapisPath),
    authPath: getModulePath(authPath),
    scopes
  })
  return result
}

/**
 * we dont want to generate a lot of async/sync calls so start by getting themanifest stuff out of the way
 * @param {string} [manifestPath ='./appsscript.json']
 * 
 */
const fxInit = (manifestPath = './appsscript.json') => {

  const fx = makeSynchronous(async ({ manifestFile, authPath }) => {

    // get the manifest
    const { readFile } = await import('node:fs/promises')
    console.log(`using manifest file:${manifestFile}`)
    const contents = await readFile(manifestFile, { encoding: 'utf8' })
    const manifest = JSON.parse(contents)

    // get the required scopes and set them
    const scopes = manifest.oauthScopes || []

    // get the current auth
    const { Auth } = await import(authPath)
    Auth.setAuth(scopes)

    // get the googleauth object
    const auth = Auth.getAuth()

    // we need the projectId for special header for UrlFetchApp to Goog apis
    const projectId = await auth.getProjectId()

    // get an access token so we can test it to pick up the authed scopes etc
    const accessToken = await auth.getAccessToken()

    // get access token info
    const { default: got } = await import('got')
    const tokenInfo = await got(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`).json()


    /// these all jst exist in this sub process so we need to send them back to parent process
    return {
      scopes,
      projectId,
      tokenInfo,
      accessToken
    }


  })

  const mainDir = path.dirname(process.argv[1])
  const manifestFile = path.resolve(mainDir, manifestPath)

  // because this is all run in a synced subprocess it's not an async result
  const synced = fx({
    manifestFile,
    authPath: getModulePath(authPath)
  })
  const {
    scopes,
    projectId,
    tokenInfo,
    accessToken
  } = synced

  // set these for the rest of the project
  Auth.setAuth(scopes)
  Auth.setProjectId(projectId)
  Auth.setTokenInfo(tokenInfo)
  Auth.setAccessToken(accessToken)

  return synced

}


/**
 * a sync version of fetching
 * @param {string} url the url to check
 * @param {object} options the options
 * @param {string[]} responseField the reponse fields to extract (we cant serialize native code)
 * @returns {reponse} urlfetch style reponse
 */
const fxFetch = (url, options, responseFields) => {
  // TODO need to handle muteHttpExceptions
  // now turn all that into a synchronous function - it runs as a subprocess, so we need to start from scratch
  const fx = makeSynchronous(async (url, options, responseFields) => {
    const { default: got } = await import('got')
    const response = await got(url, {
      ...options
    })
    // we cant return the response from this as it cant be serialized
    // so we;ll extract oout the fields required
    return responseFields.reduce((p, c) => {
      p[c] = response[c]
      return p
    }, {})
  })
  return fx(url, options, responseFields)
}

export const Syncit = {
  fxFetch,
  fxDrive,
  fxDriveMedia,
  fxInit, 
  fxStore
}