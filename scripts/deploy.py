"""Deploy a reviewed release to IONOS. Credentials are read only from environment.
Run --prepare to upload and migrate without changing the public site.
Run --activate RELEASE to activate a previously verified release.
"""
import argparse, io, os, pathlib, posixpath, stat, sys, time, tarfile
import paramiko

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = 'access-5021305806.webspace-host.com'
USER = 'su849782'

def connect():
    client = paramiko.SSHClient()
    client.load_host_keys(str(ROOT / 'scripts' / 'ionos_known_hosts'))
    client.connect(HOST, username=USER, password=os.environ['FANSXE_SSH_PASSWORD'], timeout=25, allow_agent=False, look_for_keys=False)
    return client

def run(client, command):
    _, out, err = client.exec_command(command, timeout=60)
    output, error = out.read().decode(), err.read().decode()
    if out.channel.recv_exit_status():
        raise RuntimeError('Remote command failed: ' + error[:500] + output[:500])
    if output: print(output.strip())

def files():
    for p in ROOT.iterdir():
        if p.is_file() and (p.suffix == '.html' or p.name in ['.htaccess', '.user.ini']): yield p
    for folder in ['assets', 'server', 'api', 'database']:
        for p in (ROOT / folder).rglob('*'):
            if p.is_file() and p.name != 'config.example.php': yield p

def prepare(client):
    release = time.strftime('%Y%m%d-%H%M%S', time.gmtime())
    base = '/home/www/releases/' + release
    run(client, 'mkdir -p ' + base)
    sftp = client.open_sftp(); sftp.get_channel().settimeout(30)
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode='w:gz') as tar:
        for file in files():
            if file.is_symlink(): raise ValueError('Symlink in release')
            tar.add(file, arcname=file.relative_to(ROOT).as_posix())
    archive.seek(0); sftp.putfo(archive, '/releases/' + release + '.tar.gz')
    sftp.close()
    run(client, 'tar -xzf ' + base + '.tar.gz -C ' + base)
    run(client, "find " + base + " -name '*.php' -print0 | xargs -0 -n1 php8.4 -l")
    run(client, 'php8.4 ' + base + '/server/migrate.php')
    print('RELEASE=' + release)

def activate(client, release):
    if not release or not all(c in '0123456789-' for c in release): raise ValueError('Invalid release')
    base = '/home/www/releases/' + release
    # Preserve the previous live site; migrations are forward-only and must be compatible.
    run(client, 'test -f ' + base + '/api/index.php && mkdir -p /home/www/backups && cp -a /home/www/public /home/www/backups/public-' + release)
    run(client, 'cp -a ' + base + '/assets ' + base + '/server ' + base + '/api ' + base + '/database /home/www/public/ && cp ' + base + '/*.html /home/www/public/ && cp ' + base + '/.user.ini /home/www/public/.user.ini && cp ' + base + '/.htaccess /home/www/public/.htaccess')
    print('Activated ' + release)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--prepare', action='store_true'); parser.add_argument('--activate')
    args = parser.parse_args(); client = connect()
    try:
        if args.activate: activate(client, args.activate)
        else: prepare(client)
    finally: client.close()
