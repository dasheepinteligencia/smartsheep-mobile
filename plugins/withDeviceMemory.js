const {
  withPodfile,
} = require('@expo/config-plugins');

module.exports =
  function withDeviceMemory(config) {
    return withPodfile(
      config,
      (config) => {
        let contents =
          config.modResults.contents;

        const podLine =
          "  pod 'DeviceMemory', :path => '../plugins/device-memory-ios'";

        if (!contents.includes(podLine)) {
          const targetMatch =
            contents.match(
              /target\s+['"][^'"]+['"]\s+do/
            );

          if (!targetMatch) {
            throw new Error(
              'withDeviceMemory: target iOS nao encontrado'
            );
          }

          contents =
            contents.replace(
              targetMatch[0],
              `${targetMatch[0]}\n${podLine}`
            );
        }

        const deploymentMarker =
          "build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'";

        if (!contents.includes(deploymentMarker)) {
          const postStart =
            contents.indexOf(
              '  post_install do |installer|'
            );

          if (postStart === -1) {
            throw new Error(
              'withDeviceMemory: post_install nao encontrado'
            );
          }

          const postEnd =
            contents.indexOf(
              '\n  end',
              postStart
            );

          if (postEnd === -1) {
            throw new Error(
              'withDeviceMemory: fechamento do post_install nao encontrado'
            );
          }

          const deploymentFix = `

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current_target =
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']

        if current_target.nil? ||
           Gem::Version.new(current_target) < Gem::Version.new('15.1')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
`;

          contents =
            contents.slice(0, postEnd) +
            deploymentFix +
            contents.slice(postEnd);
        }

        config.modResults.contents =
          contents;

        return config;
      }
    );
  };
