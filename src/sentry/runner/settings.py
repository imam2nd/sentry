import os
import warnings

import click

from sentry.runner import importer

DEFAULT_SETTINGS_CONF = "config.yml"
DEFAULT_SETTINGS_OVERRIDE = "sentry.conf.py"


def get_sentry_conf() -> str:
    """
    Fetch the SENTRY_CONF value, either from the click context
    if available, or SENTRY_CONF environment variable.
    """
    try:
        ctx = click.get_current_context()
        return ctx.obj["config"]
    except (RuntimeError, KeyError, TypeError):
        try:
            return os.environ["SENTRY_CONF"]
        except KeyError:
            return "~/.sentry"


def discover_configs(directory: str | None = None) -> tuple[str, str, str | None]:
    """
    Discover the locations of three configuration components:
     * Config directory (~/.sentry)
     * Optional python config file (~/.sentry/sentry.conf.py)
     * Optional yaml config (~/.sentry/config.yml)
    """
    if directory is not None:
        config = directory
    else:
        try:
            config = os.environ["SENTRY_CONF"]
        except KeyError:
            config = "~/.sentry"

    config = os.path.expanduser(config)

    # This is the old, now deprecated code path where SENTRY_CONF is pointed directly
    # to a python file
    if config.endswith((".py", ".conf")) or os.path.isfile(config):
        return (os.path.dirname(config), config, None)

    return (
        config,
        os.path.join(config, DEFAULT_SETTINGS_OVERRIDE),
        os.path.join(config, DEFAULT_SETTINGS_CONF),
    )


def configure(
    ctx: click.Context | None, py: str, yaml: str | None, skip_service_validation: bool = False
) -> None:
    """
    Given the two different config files, set up the environment.

    NOTE: Will only execute once, so it's safe to call multiple times.
    """
    global __installed
    if __installed:
        return

    # Make sure that our warnings are always displayed.
    warnings.filterwarnings("default", "", Warning, r"^sentry")

    # Add in additional mimetypes that are useful for our static files
    # which aren't common in default system registries
    import mimetypes

    for type, ext in (
        ("application/json", "map"),
        ("application/font-woff", "woff"),
        ("application/font-woff2", "woff2"),
        ("application/vnd.ms-fontobject", "eot"),
        ("application/x-font-ttf", "ttf"),
        ("application/x-font-ttf", "ttc"),
        ("font/opentype", "otf"),
        ("image/svg+xml", "svg"),
        ("text/plain", "log"),
    ):
        mimetypes.add_type(type, "." + ext)

    if yaml is None:
        # `yaml` will be None when SENTRY_CONF is pointed
        # directly to a file, in which case, this file must exist
        if not os.path.exists(py):
            if ctx:
                raise click.ClickException(
                    "Configuration file does not exist. Use 'sentry init' to initialize the file."
                )
            raise ValueError(
                "Configuration file does not exist at '%s'" % click.format_filename(py)
            )
    elif not os.path.exists(yaml) and not os.path.exists(py):
        if ctx:
            raise click.ClickException(
                "Configuration file does not exist. Use 'sentry init' to initialize the file."
            )
        raise ValueError("Configuration file does not exist at '%s'" % click.format_filename(yaml))

    # Add autoreload for config.yml file if needed
    if yaml is not None and os.path.exists(yaml):
        from sentry.utils.uwsgi import reload_on_change

        reload_on_change(yaml)

    importer.SENTRY_CONF_PY = py

    os.environ["DJANGO_SETTINGS_MODULE"] = "sentry.runner.default_settings"

    from django.conf import settings

    # HACK: we need to force access of django.conf.settings to
    # ensure we don't hit any import-driven recursive behavior
    hasattr(settings, "INSTALLED_APPS")

    from .initializer import initialize_app

    initialize_app(
        {"config_path": py, "settings": settings, "options": yaml},
        skip_service_validation=skip_service_validation,
    )

    if os.environ.get("OPENAPIGENERATE", False):
        # see https://drf-spectacular.readthedocs.io/en/latest/customization.html#step-5-extensions
        from sentry.apidocs import extensions  # NOQA

    __installed = True


__installed = False
