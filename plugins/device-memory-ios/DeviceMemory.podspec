Pod::Spec.new do |s|
  s.name         = 'DeviceMemory'
  s.version      = '1.0.0'
  s.summary      = 'SmartSheep iOS memory telemetry'
  s.description  = 'Native memory telemetry for Omni Field'
  s.homepage     = 'https://smartsheep.com.br'
  s.license      = { :type => 'Proprietary' }
  s.author       = { 'SmartSheep' => 'SmartSheep' }

  s.platform     = :ios, '15.1'

  s.source = {
    :git => 'https://example.invalid/DeviceMemory.git',
    :tag => s.version.to_s
  }

  s.source_files =
    'DeviceMemoryModule.m'

  s.requires_arc = true

  s.dependency 'React-Core'
end
