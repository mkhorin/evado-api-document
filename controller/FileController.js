/**
 * @copyright Copyright (c) 2020 Maxim Khorin <maksimovichu@gmail.com>
 */
'use strict';

const Base = require('../component/BaseController');

module.exports = class FileController extends Base {

    constructor (config) {
        super(config);
        this.security = this.createMetaSecurity();
        this.meta = this.spawn('meta/MetaParams');
        this.meta.security = this.security;
    }

    async actionUpload () {
        await this.canUpload();
        this.setMetaParams();
        const model = this.meta.view.createModel(this.getSpawnConfig());
        const behavior = this.createFileBehavior(model);
        const raw = this.spawn(behavior.getRawClass(), {
            customRule: behavior.rule
        });
        if (!await raw.upload(this.req, this.res)) {
            return this.sendText(this.translate(raw.getFirstError()), 400);
        }
        this.sendJson({
            id: raw.getId(),
            type: raw.getMediaType(),
            size: raw.getSize()
        });
    }

    async actionDownload () {
        this.setMetaParams();
        const model = await this.getModel(this.getQueryParam('id'));
        await this.security.resolveOnTitle(model);
        const behavior = this.createFileBehavior(model);
        const storage = behavior.getStorage();
        const filename = behavior.getFilename();
        const file = storage.getPath(filename);
        if (!await FileHelper.getStat(file)) {
            throw new NotFound(`File not found: ${filename}`);
        }
        const name = behavior.getName() || model.getId();
        this.setHttpHeader(storage.getHeaders(name, behavior.getMediaType()));
        this.sendFile(file);
    }

    async actionThumbnail () {
        this.setMetaParams();
        const model = await this.getModel(this.getQueryParam('id'));
        await this.security.resolveOnTitle(model);
        const behavior = this.createFileBehavior(model);
        const storage = behavior.getStorage();
        const name = behavior.getName() || model.getId();
        const filename = behavior.getFilename();
        const size = this.getQueryParam('s') || this.meta.view.options.thumbnail;
        if (size) {
            const file = await storage.ensureThumbnail(size, filename);
            if (!file) {
                throw new NotFound(`File not found: ${filename}`);
            }
            this.setHttpHeader(storage.thumbnail.getHeaders(name));
            return this.sendFile(file);
        }
        const file = storage.getPath(filename);
        if (!await FileHelper.getStat(file)) {
            throw new NotFound(`File not found: ${filename}`);
        }
        this.setHttpHeader(storage.getHeaders(name, behavior.getMediaType()));
        this.sendFile(file);
    }

    async actionDelete () {
        await this.canUpload();
        this.setMetaParams();
        const model = this.meta.view.createModel(this.getSpawnConfig());
        const behavior = this.createFileBehavior(model);
        const raw = await this.spawn(behavior.getRawClass()).findById(this.getPostParam('id')).one();
        if (!raw) {
            return this.sendStatus(404);
        }
        if (raw.getOwner()) {
            return this.sendStatus(400);
        }
        await raw.delete();
        this.sendStatus(200);
    }

    setMetaParams () {
        this.setClassMetaParams(this.getQueryParam('c'));
        this.setViewMetaParams(this.getQueryParam('v'));
        return this.meta;
    }

    createFileBehavior (model) {
        const behavior = model.createFileBehavior();
        if (behavior) {
            return behavior;
        }
        throw new BadRequest(`File behavior not found: ${model.view.id}`);
    }
};
module.exports.init(module);

const BadRequest = require('areto/error/http/BadRequest');
const NotFound = require('areto/error/http/NotFound');
const FileHelper = require('areto/helper/FileHelper');