const passport = require("passport");

const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const User = require("../models/User");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,

      clientSecret: process.env.GOOGLE_CLIENT_SECRET,

      callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
    },

    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({
          email: profile.emails[0].value,
        });

        if (!user) {
          user = await User.create({
            googleId: profile.id,

            name: profile.displayName,

            email: profile.emails[0].value,

            profilePicture: profile.photos[0].value,

            password: "Oauthuser@123",
          });
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    },
  ),
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,

      clientSecret: process.env.GITHUB_CLIENT_SECRET,

      callbackURL: `${process.env.BACKEND_URL}/api/auth/github/callback`,
    },

    async (accessToken, refreshToken, profile, done) => {
      try {
        const email =
          profile.emails?.[0]?.value || `${profile.username}@github.com`;

        let user = await User.findOne({
          email,
        });

        if (!user) {
          user = await User.create({
            githubId: profile.id,

            name: profile.displayName || profile.username,

            email,

            profilePicture: profile.photos?.[0]?.value || "",

            password: Math.random().toString(36).slice(-12),
          });
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    },
  ),
);

module.exports = passport;
