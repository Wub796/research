import os
import sys
import numpy as np
from astropy.time import Time
import astropy.units as u
from astropy.coordinates import get_body_barycentric_posvel

def inspect_velocities():
    launch = Time('2027-02-19')
    times = launch + np.arange(2) * u.hour
    
    sun_pos, sun_vel = get_body_barycentric_posvel('sun', times)
    earth_pos, earth_vel = get_body_barycentric_posvel('earth', times)
    
    sun_vel_km_s = sun_vel.xyz.value.T[0] * 1731.4568
    earth_vel_km_s = earth_vel.xyz.value.T[0] * 1731.4568
    earth_vel_helio = earth_vel_km_s - sun_vel_km_s
    
    print("Sun Barycentric Vel (km/s):", sun_vel_km_s)
    print("Earth Barycentric Vel (km/s):", earth_vel_km_s)
    print("Earth Heliocentric Vel (km/s):", earth_vel_helio)
    
    # Check spacecraft init velocity
    sc_vel_init = np.array([19.16158263, -20.64057575, -8.94723395])
    print("Spacecraft Initial Vel:", sc_vel_init)

if __name__ == "__main__":
    inspect_velocities()
