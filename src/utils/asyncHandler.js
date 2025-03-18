// const asyncHnadler = () => {}
    
    
    
    // const asyncHandler = (fn) => async (req, res, next) => {
    //     try {
    //         await fn(req, res, next)
    //     } catch (err) {
    //         resizeBy.status(err.code || 500).json({
    //             success: false,
    //             message: err.message
    //         })
    //     }
    // }

    const asyncHandler = (requestHandler) => {
        return (req, res, next) => {
            Promise.resolve(requestHandler(req, res, next)).catch
            ((err) => next(err))
        }
    }
    
    
    export {asyncHandler}