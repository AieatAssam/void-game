from kit import *


def build():
    p = car(4.0, 1.9, 'peach', roof='cream')
    p += [box('stripe', (4.02, 1.94, 0.12), loc=(0, 0, 0.72), color='white', bev=0.05)]
    return finish(join(p, 'car'))
