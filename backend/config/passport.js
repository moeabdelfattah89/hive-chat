const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('../db');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value?.toLowerCase();
        const displayName = profile.displayName || email?.split('@')[0] || 'User';
        const avatarUrl = profile.photos?.[0]?.value || null;

        if (!email) {
          return done(null, false, { message: 'No email found in Google profile' });
        }

        // 1. Check if user exists by google_id
        const byGoogleId = await pool.query(
          'SELECT id, email, display_name, avatar_url FROM users WHERE google_id = $1',
          [googleId]
        );

        if (byGoogleId.rows.length > 0) {
          return done(null, byGoogleId.rows[0]);
        }

        // 2. Check if user exists by email (link accounts)
        const byEmail = await pool.query(
          'SELECT id, email, display_name, avatar_url FROM users WHERE email = $1',
          [email]
        );

        if (byEmail.rows.length > 0) {
          // Link Google account to existing user
          await pool.query(
            'UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2',
            [googleId, byEmail.rows[0].id]
          );
          return done(null, byEmail.rows[0]);
        }

        // 3. Create new user
        const newUser = await pool.query(
          `INSERT INTO users (email, display_name, avatar_url, google_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, display_name, avatar_url`,
          [email, displayName, avatarUrl, googleId]
        );

        return done(null, newUser.rows[0]);
      } catch (err) {
        return done(err);
      }
    }
  )
);

module.exports = passport;
