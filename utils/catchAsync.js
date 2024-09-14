// UTILITY FUNCTION TO ACT AS COMMON ERROR CATCHING PLACE FOR THE ASYNC FUNCTIONS.

exports.catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
