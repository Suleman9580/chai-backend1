// const asyncHnadler = () => {}






export {asyncHnadler}





const asyncHnadler = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next)
    } catch (err) {
        resizeBy.status(err.code || 500).json({
            success: false,
            message: err.message
        })
    }
}

