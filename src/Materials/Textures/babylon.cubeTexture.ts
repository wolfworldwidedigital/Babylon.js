﻿module BABYLON {
    export class CubeTexture extends BaseTexture {
        public url: string;
        public coordinatesMode = Texture.CUBIC_MODE;

        /**
         * Gets or sets the center of the bounding box associated with the cube texture
         * It must define where the camera used to render the texture was set
         */
        public boundingBoxPosition = Vector3.Zero();

        private _boundingBoxSize: Vector3;

        /**
         * Gets or sets the size of the bounding box associated with the cube texture
         * When defined, the cubemap will switch to local mode
         * @see https://community.arm.com/graphics/b/blog/posts/reflections-based-on-local-cubemaps-in-unity
         * @example https://www.babylonjs-playground.com/#RNASML
         */
        public set boundingBoxSize(value: Vector3) {
            if (this._boundingBoxSize && this._boundingBoxSize.equals(value)) {
                return;
            }
            this._boundingBoxSize = value;
            let scene = this.getScene();
            if (scene) {
                scene.markAllMaterialsAsDirty(Material.TextureDirtyFlag);
            }
        }
        public get boundingBoxSize(): Vector3 {
            return this._boundingBoxSize;
        }


        @serialize("rotationY")
        protected _rotationY: number = 0;
        /**
         * Sets texture matrix rotation angle around Y axis in radians.
         */
        public set rotationY(value: number) {
            this._rotationY = value;
            this.setReflectionTextureMatrix(BABYLON.Matrix.RotationY(this._rotationY));
        }
        /**
         * Gets texture matrix rotation angle around Y axis radians.
         */
        public get rotationY(): number {
            return this._rotationY;
        }        

        private _noMipmap: boolean;
        private _files: string[];
        private _extensions: string[];
        private _textureMatrix: Matrix;
        private _format: number;
        private _prefiltered: boolean;
        private _createPolynomials: boolean;

        public static CreateFromImages(files: string[], scene: Scene, noMipmap?: boolean) {
            let rootUrlKey = "";

            files.forEach(url => rootUrlKey += url);

            return new CubeTexture(rootUrlKey, scene, null, noMipmap, files);
        }

        /**
         * Creates and return a texture created from prefilterd data by tools like IBL Baker or Lys.
         * @param url defines the url of the prefiltered texture
         * @param scene defines the scene the texture is attached to
         * @param forcedExtension defines the extension of the file if different from the url
         * @param createPolynomials defines whether or not to create polynomial harmonics from the texture data if necessary
         * @return the prefiltered texture
         */
        public static CreateFromPrefilteredData(url: string, scene: Scene, forcedExtension: any = null, createPolynomials: boolean = true) {
            return new CubeTexture(url, scene, null, false, null, null, null, undefined, true, forcedExtension, createPolynomials);
        }

        /**
         * Creates a cube texture to use with reflection for instance. It can be based upon dds or six images as well
         * as prefiltered data.
         * @param rootUrl defines the url of the texture or the root name of the six images
         * @param scene defines the scene the texture is attached to
         * @param extensions defines the suffixes add to the picture name in case six images are in use like _px.jpg...
         * @param noMipmap defines if mipmaps should be created or not
         * @param files defines the six files to load for the different faces
         * @param onLoad defines a callback triggered at the end of the file load if no errors occured
         * @param onError defines a callback triggered in case of error during load
         * @param format defines the internal format to use for the texture once loaded
         * @param prefiltered defines whether or not the texture is created from prefiltered data
         * @param forcedExtension defines the extensions to use (force a special type of file to load) in case it is different from the file name
         * @param createPolynomials defines whether or not to create polynomial harmonics from the texture data if necessary
         * @return the cube texture
         */
        constructor(rootUrl: string, scene: Scene, extensions: Nullable<string[]> = null, noMipmap: boolean = false, files: Nullable<string[]> = null,
            onLoad: Nullable<() => void> = null, onError: Nullable<(message?: string, exception?: any) => void> = null, format: number = Engine.TEXTUREFORMAT_RGBA, prefiltered = false, 
            forcedExtension: any = null, createPolynomials: boolean = false) {
            super(scene);

            this.name = rootUrl;
            this.url = rootUrl;
            this._noMipmap = noMipmap;
            this.hasAlpha = false;
            this._format = format;
            this._prefiltered = prefiltered;
            this.isCube = true;
            this._textureMatrix = Matrix.Identity();
            this._createPolynomials = createPolynomials;
            if (prefiltered) {
                this.gammaSpace = false;
            }

            if (!rootUrl && !files) {
                return;
            }

            this._texture = this._getFromCache(rootUrl, noMipmap);

            const lastDot = rootUrl.lastIndexOf(".");
            const extension = forcedExtension ? forcedExtension : (lastDot > -1 ? rootUrl.substring(lastDot).toLowerCase() : "");
            const isDDS = (extension === ".dds");
            const isEnv = (extension === ".env");

            if (!files) {
                if (!isEnv && !isDDS && !extensions) {
                    extensions = ["_px.jpg", "_py.jpg", "_pz.jpg", "_nx.jpg", "_ny.jpg", "_nz.jpg"];
                }

                files = [];

                if (extensions) {

                    for (var index = 0; index < extensions.length; index++) {
                        files.push(rootUrl + extensions[index]);
                    }
                }
            }

            this._files = files;

            if (!this._texture) {
                // Prefiltered are only available in DDS. 
                if (!isDDS) {
                    prefiltered = false;
                }

                if (!scene.useDelayedTextureLoading) {
                    if (prefiltered) {
                        this._texture = scene.getEngine().createPrefilteredCubeTexture(rootUrl, scene, this.lodGenerationScale, this.lodGenerationOffset, onLoad, onError, format, forcedExtension, this._createPolynomials);
                    }
                    else {
                        this._texture = scene.getEngine().createCubeTexture(rootUrl, scene, files, noMipmap, onLoad, onError, this._format, forcedExtension);
                    }
                } else {
                    this.delayLoadState = Engine.DELAYLOADSTATE_NOTLOADED;
                }
            } else if (onLoad) {
                if (this._texture.isReady) {
                    Tools.SetImmediate(() => onLoad());
                } else {
                    this._texture.onLoadedObservable.add(onLoad);
                }
            }
        }

        // Methods
        public delayLoad(): void {
            if (this.delayLoadState !== Engine.DELAYLOADSTATE_NOTLOADED) {
                return;
            }

            let scene = this.getScene();

            if (!scene) {
                return;
            }
            this.delayLoadState = Engine.DELAYLOADSTATE_LOADED;
            this._texture = this._getFromCache(this.url, this._noMipmap);

            if (!this._texture) {
                if (this._prefiltered) {
                    this._texture = scene.getEngine().createPrefilteredCubeTexture(this.url, scene, this.lodGenerationScale, this.lodGenerationOffset, undefined, undefined, this._format, undefined, this._createPolynomials);
                }
                else {
                    this._texture = scene.getEngine().createCubeTexture(this.url, scene, this._files, this._noMipmap, undefined, undefined, this._format);
                }
            }
        }

        public getReflectionTextureMatrix(): Matrix {
            return this._textureMatrix;
        }

        public setReflectionTextureMatrix(value: Matrix): void {
            this._textureMatrix = value;
        }

        public static Parse(parsedTexture: any, scene: Scene, rootUrl: string): CubeTexture {
            var texture = SerializationHelper.Parse(() => {
                var prefiltered:boolean = false;
                if (parsedTexture.prefiltered) {
                    prefiltered = parsedTexture.prefiltered;
                }
                return new CubeTexture(rootUrl + parsedTexture.name, scene, parsedTexture.extensions, false, null, null, null, undefined, prefiltered);
            }, parsedTexture, scene);

            // Local Cubemaps
            if (parsedTexture.boundingBoxPosition) {
                texture.boundingBoxPosition = Vector3.FromArray(parsedTexture.boundingBoxPosition);
            }
            if (parsedTexture.boundingBoxSize) {
                texture.boundingBoxSize = Vector3.FromArray(parsedTexture.boundingBoxSize);
            }

            // Animations
            if (parsedTexture.animations) {
                for (var animationIndex = 0; animationIndex < parsedTexture.animations.length; animationIndex++) {
                    var parsedAnimation = parsedTexture.animations[animationIndex];

                    texture.animations.push(Animation.Parse(parsedAnimation));
                }
            }

            return texture;
        }

        public clone(): CubeTexture {
            return SerializationHelper.Clone(() => {
                let scene = this.getScene();

                if (!scene) {
                    return this;
                }
                return new CubeTexture(this.url, scene, this._extensions, this._noMipmap, this._files);
            }, this);
        }
    }
} 