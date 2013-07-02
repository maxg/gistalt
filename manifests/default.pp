# Update packages before installing
stage { 'pre': }
class { apt: stage => 'pre'; }
class apt {
  exec { 'apt-get update': command => '/usr/bin/apt-get update'; }
}
Exec['apt-get update'] -> Package <| |>

package {
  [ 'git', 'python-software-properties', 'vim' ]:
    ensure => 'installed';

  [ 'g++', 'make' ]:
    ensure => 'installed';

  [ 'nodejs' ]:
    ensure => 'installed',
    require => Exec['add-apt node'];
}

exec {
  'add-apt node':
    command => 'add-apt-repository ppa:chris-lea/node.js && apt-get update',
    path => '/usr/bin',
    require => Package['python-software-properties'],
    unless => 'test -f /etc/apt/sources.list.d/chris-lea-node_js*.list';
}
