import { Proxies } from '../../support/proxies.js'
import { Utils } from '../../support/utils.js'
import { isGoogleType } from '../../support/general.js'
import is from '@sindresorhus/is'

import mime from 'mime';
// Apps Script blob fake


class FakeBlob {
  /**
   * 
   * @constructor 
   * @param {*} [data] data 
   * @param {string} [contentType]
   * @param {string} [name]
   * @returns {FakeBlob}
   */
  constructor(data, contentType, name) {
    this._data = Utils.settleAsBytes(data)
    this._contentType = contentType || 
      (is.string(data) ? 'text/plain' : null)
    this._name = name || null
  }


  getBytes() {
    return this._data
  }

  getContentType() {
    return this._contentType
  }

  getName() {
    return this._name
  }

  isGoogleType() {
    return isGoogleType(this.getContentType())
  }

  getDataAsString(charset) {
    return Utils.bytesToString(this._data, charset)
  }

  copyBlob() {
    return newFakeBlob(this.getBytes(), this.getContentType(), this.getName())
  }

  setBytes(data) {
    Utils.assert.array(data)
    this._data = data
    return this
  }
  setContentType(contentType) {
    this._contentType = contentType
    return this
  }

  setContentTypeFromExtension() {
    return this.setContentType(mime.getType(this.getName()))
  }

  setDataFromString(string, charset) {
    return this.setBytes(Utils.stringToBytes(string, charset))
  }

  setName(name) {
    this._name = name
    return this
  }

}
export const newFakeBlob = (...args) => Proxies.guard(new FakeBlob(...args))