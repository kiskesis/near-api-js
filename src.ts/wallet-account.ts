'use strict';

import { KeyStore, BrowserLocalStorageKeyStore } from './key_stores';
import { KeyPair } from './utils';

const LOGIN_WALLET_URL_SUFFIX = '/login/';

const LOCAL_STORAGE_KEY_SUFFIX = '_wallet_auth_key';
const PENDING_ACCESS_KEY_PREFIX = 'pending_key'; // browser storage key for a pending access key (i.e. key has been generated but we are not sure it was added yet)

export class WalletAccount {
    _walletBaseUrl: string;
    _authDataKey: string;
    _keyStore: KeyStore;
    _authData: any;
    _networkId: string;

    constructor(networkId: string, appKeyPrefix: string, walletBaseUrl = 'https://wallet.nearprotocol.com', keyStore: KeyStore = new BrowserLocalStorageKeyStore()) {
        this._networkId = networkId;
        this._walletBaseUrl = walletBaseUrl;
        this._authDataKey = appKeyPrefix + LOCAL_STORAGE_KEY_SUFFIX;
        this._keyStore = keyStore;

        this._authData = JSON.parse(window.localStorage.getItem(this._authDataKey) || '{}');
        if (!this.isSignedIn()) {
            this._completeSignInWithAccessKey();
        }
    }

    /**
     * Returns true, if this WalletAccount is authorized with the wallet.
     * @example
     * walletAccount.isSignedIn();
     */
    isSignedIn() {
        return !!this._authData.accountId;
    }

    /**
     * Returns authorized Account ID.
     * @example
     * walletAccount.getAccountId();
     */
    getAccountId() {
        return this._authData.accountId || '';
    }

    /**
     * Redirects current page to the wallet authentication page.
     * @param {string} contract_id contract ID of the application
     * @param {string} title name of the application
     * @param {string} success_url url to redirect on success
     * @param {string} failure_url url to redirect on failure
     * @example
     *   walletAccount.requestSignIn(
     *     myContractId,
     *     title,
     *     onSuccessHref,
     *     onFailureHref);
     */
    requestSignIn(contract_id: string, title: string, success_url: string, failure_url: string) {
        const currentUrl = new URL(window.location.href);
        const newUrl = new URL(this._walletBaseUrl + LOGIN_WALLET_URL_SUFFIX);
        newUrl.searchParams.set('title', title);
        newUrl.searchParams.set('contract_id', contract_id);
        newUrl.searchParams.set('success_url', success_url || currentUrl.href);
        newUrl.searchParams.set('failure_url', failure_url || currentUrl.href);
        newUrl.searchParams.set('app_url', currentUrl.origin);
        if (!this.getAccountId() || !this._keyStore.getKey(this._networkId, this.getAccountId())) {
            const accessKey = KeyPair.fromRandom('ed25519');
            newUrl.searchParams.set('public_key', accessKey.getPublicKey());
            this._keyStore.setKey(this._networkId, PENDING_ACCESS_KEY_PREFIX + accessKey.getPublicKey(), accessKey)
                .then(() => window.location.replace(newUrl.toString()));
        }
    }

    /**
     * Complete sign in for a given account id and public key. To be invoked by the app when getting a callback from the wallet.
     */
    _completeSignInWithAccessKey() {
        const currentUrl = new URL(window.location.href);
        const publicKey = currentUrl.searchParams.get('public_key') || '';
        const accountId = currentUrl.searchParams.get('account_id') || '';
        if (accountId && publicKey) {
            this._authData = {
                accountId
            };
            window.localStorage.setItem(this._authDataKey, JSON.stringify(this._authData));
            this._moveKeyFromTempToPermanent(accountId, publicKey);
        }
    }

    async _moveKeyFromTempToPermanent(accountId: string, publicKey: string) {
        const keyPair = await this._keyStore.getKey(this._networkId, PENDING_ACCESS_KEY_PREFIX + publicKey);
        await this._keyStore.setKey(this._networkId, accountId, keyPair);
        await this._keyStore.removeKey(this._networkId, PENDING_ACCESS_KEY_PREFIX + publicKey);
    }

    /**
     * Sign out from the current account
     * @example
     * walletAccount.signOut();
     */
    signOut() {
        this._authData = {};
        window.localStorage.removeItem(this._authDataKey);
    }
}
