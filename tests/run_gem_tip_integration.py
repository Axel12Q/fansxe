"""Run connection-local temporary-table tip checks on a prepared release."""
import os
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from deploy import connect, run
release = sys.argv[1]
if not all(c in '0123456789-' for c in release):
    raise ValueError('Invalid release')
client = connect()
try:
    sftp = client.open_sftp()
    path = '/fansxe-private/tip-integration.php'
    sftp.put(str(pathlib.Path(__file__).with_name('gem_tip_integration.php')), path)
    sftp.chmod(path, 0o600)
    try:
        run(client, 'php8.4 /home/www/fansxe-private/tip-integration.php /home/www/releases/' + release)
    finally:
        sftp.remove(path)
        sftp.close()
finally:
    client.close()
