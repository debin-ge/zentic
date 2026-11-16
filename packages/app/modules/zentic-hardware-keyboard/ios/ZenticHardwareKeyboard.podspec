require 'json'

Pod::Spec.new do |s|
  s.name           = 'ZenticHardwareKeyboard'
  s.version        = '0.1.0'
  s.summary        = 'Hardware keyboard shortcuts for Zentic'
  s.description    = 'Hardware keyboard shortcuts for Zentic'
  s.license        = 'Apache-2.0'
  s.author         = 'Zentic'
  s.homepage       = 'https://zentic.sh'
  s.platforms      = { :ios => '13.4' }
  s.swift_version  = '5.4'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
