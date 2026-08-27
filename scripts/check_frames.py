from astropy.time import Time
from astropy.coordinates import get_body_barycentric_posvel, get_body
import astropy.units as u

def find_velocity_frame():
    t = Time('2027-02-19')
    print("Launch Epoch:", t)
    
    # 1. Barycentric (ICRS)
    _, earth_vel_bary = get_body_barycentric_posvel('earth', t)
    print("ICRS Barycentric Vel (km/s):", earth_vel_bary.xyz.value.T[0] * 1731.4568)
    
    # Let's check Sun's barycentric velocity too
    _, sun_vel_bary = get_body_barycentric_posvel('sun', t)
    print("Sun Barycentric Vel (km/s):", sun_vel_bary.xyz.value.T[0] * 1731.4568)
    
    # Heliocentric velocity of Earth in ICRS
    print("Heliocentric Earth Vel (km/s):", (earth_vel_bary.xyz.value.T[0] - sun_vel_bary.xyz.value.T[0]) * 1731.4568)

if __name__ == "__main__":
    find_velocity_frame()
