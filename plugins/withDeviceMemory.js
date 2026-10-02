const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function withDeviceMemory(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const packageName = config.android?.package;

      if (!packageName) {
        throw new Error(
          'withDeviceMemory: android.package nao definido'
        );
      }

      const projectRoot =
        config.modRequest.projectRoot;

      const androidRoot =
        config.modRequest.platformProjectRoot;

      const packagePath =
        packageName.split('.');

      const javaDir =
        path.join(
          androidRoot,
          'app',
          'src',
          'main',
          'java',
          ...packagePath
        );

      const sourceDir =
        path.join(
          projectRoot,
          'plugins',
          'device-memory'
        );

      const moduleSource =
        path.join(
          sourceDir,
          'DeviceMemoryModule.kt'
        );

      const packageSource =
        path.join(
          sourceDir,
          'DeviceMemoryPackage.kt'
        );

      const moduleTarget =
        path.join(
          javaDir,
          'DeviceMemoryModule.kt'
        );

      const packageTarget =
        path.join(
          javaDir,
          'DeviceMemoryPackage.kt'
        );

      const mainApplication =
        path.join(
          javaDir,
          'MainApplication.kt'
        );

      if (
        !fs.existsSync(moduleSource) ||
        !fs.existsSync(packageSource)
      ) {
        throw new Error(
          'withDeviceMemory: fontes Kotlin nao encontradas'
        );
      }

      if (!fs.existsSync(mainApplication)) {
        throw new Error(
          'withDeviceMemory: MainApplication.kt nao encontrado'
        );
      }

      fs.mkdirSync(
        javaDir,
        { recursive: true }
      );

      const expectedPackage =
        `package ${packageName}`;

      for (const source of [
        moduleSource,
        packageSource,
      ]) {
        const contents =
          fs.readFileSync(
            source,
            'utf8'
          );

        if (
          !contents.includes(
            expectedPackage
          )
        ) {
          throw new Error(
            `withDeviceMemory: package Kotlin divergente em ${path.basename(source)}`
          );
        }
      }

      fs.copyFileSync(
        moduleSource,
        moduleTarget
      );

      fs.copyFileSync(
        packageSource,
        packageTarget
      );

      let main =
        fs.readFileSync(
          mainApplication,
          'utf8'
        );

      const registration =
        'add(DeviceMemoryPackage())';

      if (
        !main.includes(
          registration
        )
      ) {
        const marker =
          'PackageList(this).packages.apply {';

        if (
          !main.includes(marker)
        ) {
          throw new Error(
            'withDeviceMemory: ponto de registro nao encontrado no MainApplication.kt'
          );
        }

        main =
          main.replace(
            marker,
            `${marker}\n          ${registration}`
          );
      }

      fs.writeFileSync(
        mainApplication,
        main
      );

      return config;
    },
  ]);
};
