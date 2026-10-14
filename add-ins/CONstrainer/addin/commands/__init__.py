# Commands registered by the CONstrainer add-in.

from .constraints import entry as constraints

commands = [
    constraints,
]


def start():
    for command in commands:
        command.start()


def stop():
    for command in commands:
        command.stop()
