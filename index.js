var _ = require('underscore');
var native = require('./build/Release/native.node');

module.exports = function(scope) {
    // Set config defaults for `root:p1-mac-sources` before init.
    scope.$on('preInit', function() {
        var settings = scope.cfg['root:p1-mac-sources'] ||
            (scope.cfg['root:p1-mac-sources'] = {});
        _.defaults(settings, {
            type: 'root:p1-mac-sources',
            audioQueueIds: [],
            displayStreamIds: []
        });
    });

    // Define the plugin root type.
    scope.o.$onCreate('root:p1-mac-sources', function(obj) {
        obj.$resolveAll('audioQueues');
        obj.$resolveAll('displayStreams');

        // Set detected displays on the root.
        obj.$monitor = new native.DetectDisplays({
            onEvent: function(id, arg) {
                switch (id) {
                    case native.EV_DISPLAYS_CHANGED:
                        obj.displays = arg;
                        obj.$mark();
                        break;

                    default:
                        scope.handleNativeEvent(obj, id, arg);
                        break;
                }
            }
        });
    });

    // Implement audio queue source type.
    scope.o.$onCreate('source:audio:p1-mac-sources:audio-queue', function(obj) {
        obj.$activation({
            start: function() {
                try {
                    obj.$instance = new native.AudioQueue({
                        device: obj.cfg.device,
                        onEvent: function(id, arg) {
                            scope.handleNativeEvent(obj, id, arg);
                        }
                    });
                }
                catch (err) {
                    obj.$log.error(err, "Failed to instantiate AudioQueue");
                    obj.hasError = true;
                }
                obj.$mark();
            },
            stop: function() {
                obj.$instance.destroy();
                obj.$instance = null;
                obj.$mark();
            }
        });
    });

    // Implement display stream source type.
    scope.o.$onCreate('source:video:p1-mac-sources:display-stream', function(obj) {
        obj.$activation({
            cond: function() {
                // In addition to the default condition, ensure the display is
                // detected before we activate the stream.
                return obj.$defaultCond() &&
                    _.findWhere(scope.o['root:p1-mac-sources'].displays, {
                        displayId: obj.cfg.displayId
                    });
            },
            start: function() {
                try {
                    obj.$instance = new native.DisplayStream({
                        displayId: obj.cfg.displayId,
                        onEvent: function(id, arg) {
                            scope.handleNativeEvent(obj, id, arg);
                        }
                    });
                }
                catch (err) {
                    obj.$log.error(err, "Failed to instantiate DisplayStream");
                    obj.hasError = true;
                }
                obj.$mark();
            },
            stop: function() {
                obj.$instance.destroy();
                obj.$instance = null;
                obj.$mark();
            }
        });
    });

    // Handle preview connections.
    native.startPreviewService({
        name: "com.p1stream.P1stream.preview",
        onEvent: function(id, arg) {
            switch (id) {
                case native.EV_PREVIEW_REQUEST:
                    connectHook(arg);
                    break;

                default:
                    scope.handleNativeEvent(obj, id, arg);
                    break;
            }
        }
    });
    function connectHook(hook) {
        var id = hook.mixerId;

        var obj = id && id[0] !== '$' && scope.o[id];
        if (!obj || obj.cfg.type !== 'mixer')
            return hook.destroy();

        hook.onClose = destroy;
        var cancel = obj.$addFrameListener({
            hook: hook,
            $destroy: destroy
        });

        function destroy() {
            cancel();
            hook.destroy();
        }
    }
};
